// Navigation hooks observed on Meta AI's rendered sidebar, 2026-10-26.
// Only these fixed UI actions are allowed; no account data or private APIs.
export function metaDocument(contents){
 if(!contents||contents.isDestroyed())return false;
 try{const u=new URL(contents.getURL());return ['https://www.meta.ai','https://meta.ai'].includes(u.origin)&&!u.username&&!u.password;}catch{return false;}
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
