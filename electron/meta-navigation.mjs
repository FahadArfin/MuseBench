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
