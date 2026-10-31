// Navigation hooks observed on Meta AI's rendered sidebar, 2026-10-26.
// Only these fixed UI actions are allowed; no account data or private APIs.
export function metaDocument(contents){
 if(!contents||contents.isDestroyed())return false;
 try{const u=new URL(contents.getURL());return ['https://www.meta.ai','https://meta.ai'].includes(u.origin)&&!u.username&&!u.password;}catch{return false;}
}
// Readiness means the observed navigation is usable, not that an account is
// authenticated. It permits read-only preparation without inspecting identity,
// credentials, storage, message content, or application internals.
export async function metaNavigationReady(contents){
 if(!metaDocument(contents)||contents.isLoadingMainFrame?.())return false;
 let timer;
 try{
  const result=await Promise.race([contents.executeJavaScript(`(${function(){
   if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin)||document.readyState!=='complete')return false;
   const nav=document.querySelector('nav[data-slot="sidebar"][aria-label="Sidebar"]');
   if(!nav?.querySelector('[data-testid="new-chat-button"]'))return false;
   const paths=new Set(Array.from(nav.querySelectorAll('a[href]')).flatMap(link=>{
    try{const url=new URL(link.getAttribute('href'),location.href);return url.origin===location.origin&&!url.username&&!url.password?[url.pathname.replace(/\/$/,'')]:[];}catch{return [];}
   }));
   if(!paths.has('/artifacts')||!paths.has('/scheduled'))return false;
   const visible=element=>{
    if(element.hidden||!element.getClientRects().length)return false;
    const style=getComputedStyle(element);
    return style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&style.opacity!=='0';
   };
   const signIn=/^(?:log\s*in|sign\s*in|continue with (?:facebook|instagram|meta))\b/i;
   if(Array.from(document.querySelectorAll('button,a,[role="button"]')).some(control=>visible(control)&&[control.textContent,control.getAttribute('aria-label')].some(label=>signIn.test((label??'').trim()))))return false;
   if(Array.from(document.querySelectorAll('input[type="password"],form[action*="login"]')).some(visible))return false;
   if(Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog=>visible(dialog)&&[dialog.getAttribute('aria-label'),dialog.querySelector('h1,h2,[role="heading"]')?.textContent].some(label=>signIn.test((label??'').trim()))))return false;
   return true;
  }.toString()})()`),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1500);timer.unref?.();})]);
  return result===true;
 }catch{return false;}finally{clearTimeout(timer);}
}
export const metaNavigationCSS=`
 nav[data-slot="sidebar"][aria-label="Sidebar"]:has([data-testid="new-chat-button"]):has(a[href="/create"]):has(a[href="/artifacts"]) { display:none !important; }
`;
const pendingDismissals=new WeakMap();
export function dismissMetaSearch(contents){
 if(!metaDocument(contents))return Promise.resolve(false);
 if(pendingDismissals.has(contents))return pendingDismissals.get(contents);
 const closing=(async()=>{
  try{return await contents.executeJavaScript(`(${async function(){
   if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin))return false;
   const search=()=>document.querySelector('[role="dialog"] input[placeholder="Search chats"]')?.closest('[role="dialog"]');
   const dialog=search();if(!dialog)return true;
   const close=dialog.querySelector('button[aria-label="Close"]');if(!close||close.disabled)return false;
   close.click();
   const deadline=Date.now()+1500;
   while(Date.now()<deadline){if(!search())return true;await new Promise(resolve=>setTimeout(resolve,40));}
   return false;
  }.toString()})()`,true)===true;}catch{return false;}
 })();
 pendingDismissals.set(contents,closing);
 void closing.finally(()=>{if(pendingDismissals.get(contents)===closing)pendingDismissals.delete(contents);});
 return closing;
}
export async function runMetaAction(contents,action){
 if(!['newChat','search','media','artifacts','scheduled','vibes'].includes(action)||!metaDocument(contents))return false;
 // A native shell click can already be closing Search. Finish that close before
 // opening it again or changing routes, so a late dismissal cannot race Search.
 if(pendingDismissals.has(contents))await pendingDismissals.get(contents);
 if(action!=='search'&&!await dismissMetaSearch(contents))return false;
 try{return await contents.executeJavaScript(`(${async function(request){
  const onMeta=()=>['https://www.meta.ai','https://meta.ai'].includes(location.origin);
  const paths={newChat:'/',media:'/create',artifacts:'/artifacts',scheduled:'/scheduled',vibes:'/vibes'};
  const deadline=Date.now()+8000;
  while(onMeta()&&Date.now()<deadline){
   // Cached Search owns its existing query. Re-selecting it should only open
   // the dialog after the user closed it, never click an already open Search.
   if(request==='search'&&document.querySelector('[role="dialog"] input[placeholder="Search chats"]'))return true;
   const nav=document.querySelector('nav[data-slot="sidebar"][aria-label="Sidebar"]:has([data-testid="new-chat-button"])');
   if(nav&&document.readyState==='complete'){
    const controls=[...nav.querySelectorAll('a,button')];
    const control=request==='search'?controls.find(e=>/^Search(?:Ctrl|⌘|\s|$)/.test((e.textContent||'').trim())):controls.find(e=>{if(e.tagName!=='A')return false;try{const u=new URL(e.getAttribute('href'),location.href);return u.origin===location.origin&&u.pathname.replace(/\/$/,'')===paths[request].replace(/\/$/,'');}catch{return false;}});
    if(control&&!control.disabled){
     control.click();
     // Check the resulting route or dialog instead of treating a click as success.
     const end=Date.now()+3000;
     while(onMeta()&&Date.now()<end){
      const searchOpen=Boolean(document.querySelector('[role="dialog"] input[placeholder="Search chats"]'));
      if(request==='search'?searchOpen:!searchOpen&&location.pathname.replace(/\/$/,'')===paths[request].replace(/\/$/,''))return true;
      await new Promise(r=>setTimeout(r,80));
     }
     return false;
    }
   }
   await new Promise(r=>setTimeout(r,80));
  }
  return false;
 }.toString()})(${JSON.stringify(action)})`,true)===true;}catch{return false;}
}

// Open Meta's own settings UI. These are navigation-only shortcuts: purchases,
// account changes and connector authorization remain explicit user actions.
const pendingSettings=new WeakMap();
let settingsSequence=Date.now()*1000;
export async function runMetaSettings(contents,section,{signal}={}){
 if(signal?.aborted||!['general','apps'].includes(section)||!metaDocument(contents))return false;
 pendingSettings.get(contents)?.cancel();
 const token=++settingsSequence,deadline=Date.now()+4200;
 let timer,cancelled=false,resolveCancelled;
 const cancelledResult=new Promise(resolve=>{resolveCancelled=resolve;});
 const invalidate=()=>{
  if(contents.isDestroyed())return;
  // Retain a tombstone so an execution queued before cancellation cannot start
  // afterward. An older cancellation never invalidates a newer request.
  try{void contents.executeJavaScript(`(${function(id){
   const key=Symbol.for('musebench.metaSettingsNavigation');
   const current=globalThis[key];
   if(!current||current.token<=id)globalThis[key]={token:id,active:false};
  }.toString()})(${token})`).catch(()=>{});}catch{}
 };
 const cancel=()=>{if(cancelled)return;cancelled=true;invalidate();resolveCancelled(false);};
 const onNavigation=(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame!==false)cancel();};
 const owner={cancel};pendingSettings.set(contents,owner);
 signal?.addEventListener('abort',cancel,{once:true});
 contents.on?.('did-start-navigation',onNavigation);contents.on?.('destroyed',cancel);
 if(signal?.aborted)cancel();
 timer=setTimeout(cancel,5000);timer.unref?.();
 try{
  if(cancelled)return false;
  return await Promise.race([contents.executeJavaScript(`(${async function(request,token,deadline){
   const key=Symbol.for('musebench.metaSettingsNavigation');
   if(Date.now()>=deadline||globalThis[key]?.token>=token)return false;
   globalThis[key]={token,active:true};
   const current=()=>globalThis[key]?.token===token&&globalThis[key]?.active&&Date.now()<deadline;
   const onMeta=()=>['https://www.meta.ai','https://meta.ai'].includes(location.origin);
   const label=element=>(element.getAttribute('aria-label')||element.textContent||'').trim();
   const visible=element=>{
    if(!element||element.hidden||!element.getClientRects().length)return false;
    const style=getComputedStyle(element);return style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&style.opacity!=='0';
   };
   const enabled=element=>element&&!element.disabled&&element.getAttribute('aria-disabled')!=='true';
   const wanted=request==='apps'?'Apps':'General';
   const settingsDialog=()=>Array.from(document.querySelectorAll('[role="dialog"]')).find(dialog=>visible(dialog)&&(['Settings',...(request==='apps'?['Apps']:[])].includes(dialog.getAttribute('aria-label'))||Array.from(dialog.querySelectorAll('h1,h2,[role="heading"]')).some(heading=>visible(heading)&&label(heading)==='Settings')));
   const sectionOpen=dialog=>{
    const headings=Array.from(dialog.querySelectorAll('h1,h2,h3,[role="heading"]')).filter(heading=>visible(heading)&&!heading.closest('nav,button,[role="tab"]'));
    if(headings.some(heading=>label(heading)===wanted))return true;
    if(request==='apps')return headings.some(heading=>['Unconnected apps','Connected apps'].includes(label(heading)));
    // The live General title is plain text. Its Accounts Center link is the
    // observed destination marker, scoped to the visible Settings dialog.
    return Array.from(dialog.querySelectorAll('a[href]')).some(link=>{
     if(!visible(link)||label(link)!=='Accounts Center')return false;
     try{const url=new URL(link.getAttribute('href'),location.href);return url.origin==='https://accountscenter.meta.com'&&!url.username&&!url.password;}catch{return false;}
    });
   };
   let triggerClicked=false,menuClicked=false;
   const clickedTabs=new WeakMap();
   while(onMeta()&&current()){
    const dialog=settingsDialog();
    if(dialog){
     if(sectionOpen(dialog))return true;
     const tab=Array.from(dialog.querySelectorAll('button,[role="tab"]')).find(control=>visible(control)&&enabled(control)&&label(control)===wanted);
     if(!tab)return false;
     // Hydration can attach the handler after its button appears. Only these two
     // harmless navigation tabs may be retried, at a bounded interval.
     const last=clickedTabs.get(tab)||0;
     if(current()&&Date.now()-last>400){clickedTabs.set(tab,Date.now());tab.click();}
    }else{
     // Apps is also an observed direct profile-menu entry on Meta AI.
     const menus=Array.from(document.querySelectorAll('[role="menu"]')).filter(visible);
     const entries=menus.flatMap(menu=>Array.from(menu.querySelectorAll('[role="menuitem"]'))).filter(control=>visible(control)&&enabled(control));
     const item=(request==='apps'&&entries.find(control=>label(control)==='Apps'))||entries.find(control=>label(control)==='Settings');
     if(item&&!menuClicked&&current()){menuClicked=true;item.click();}
     else if(!triggerClicked&&!menuClicked){
      const trigger=document.querySelector('nav[data-slot="sidebar"][aria-label="Sidebar"] [data-testid="user-menu-button"][data-slot="dropdown-menu-trigger"]');
      if(!enabled(trigger))return false;
      // MuseBench's integrated layout intentionally hides this exact sidebar;
      // no other hidden page control is eligible for a click.
      if(!current())return false;triggerClicked=true;
      // The observed Meta profile dropdown opens on pointerdown, not click.
      // Keep this event restricted to its exact harmless navigation trigger.
      const pointer=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'mouse',button:0,ctrlKey:false});
      trigger.dispatchEvent(pointer);
      // A handled pointerdown must never be followed by a second toggle.
      // Allow its menu/expanded state to settle before a click-only fallback.
      if(!pointer.defaultPrevented){
       const opened=()=>trigger.getAttribute('aria-expanded')==='true'||Boolean(settingsDialog())||Array.from(document.querySelectorAll('[role="menu"]')).some(visible);
       const settleUntil=Math.min(deadline,Date.now()+240);
       while(current()&&onMeta()&&!opened()&&Date.now()<settleUntil)await new Promise(resolve=>setTimeout(resolve,40));
       if(current()&&onMeta()&&trigger.isConnected&&enabled(trigger)&&!opened())trigger.click();
      }
     }
    }
    await new Promise(resolve=>setTimeout(resolve,80));
   }
   return false;
  }.toString()})(${JSON.stringify(section)},${token},${deadline})`,true),cancelledResult])===true&&!cancelled;
 }catch{return false;}finally{
  clearTimeout(timer);invalidate();
  signal?.removeEventListener('abort',cancel);
  contents.removeListener?.('did-start-navigation',onNavigation);contents.removeListener?.('destroyed',cancel);
  if(pendingSettings.get(contents)===owner)pendingSettings.delete(contents);
 }
}
