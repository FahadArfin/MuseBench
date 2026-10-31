import {META_APPS,unknownMetaApps} from '../src/shared/meta-apps.mjs';
import {metaDocument} from './meta-navigation.mjs';

const pending=new WeakMap();let sequence=Date.now()*1000;
const unavailable=()=>({status:'unavailable',items:unknownMetaApps()});
// Only rendered, exact official app names are inspected. No private API,
// credentials, account content, or consent controls are read or submitted.
async function inspect(contents,appId,{signal}={}){
 if(signal?.aborted||!metaDocument(contents))return null;
 pending.get(contents)?.();const token=++sequence,deadline=Date.now()+1800;
 let timer,cancelled=false,settle;
 const cancellation=new Promise(resolve=>{settle=resolve;});
 const invalidate=()=>{try{if(!contents.isDestroyed())void contents.executeJavaScript(`(()=>{const k=Symbol.for('musebench.metaApps');if(!globalThis[k]||globalThis[k].token<=${token})globalThis[k]={token:${token},active:false};})()`).catch(()=>{});}catch{}};
 const cancel=()=>{cancelled=true;invalidate();settle(null);};
 const navigation=(_event,_url,_inPage,main)=>{if(main!==false)cancel();};
 pending.set(contents,cancel);signal?.addEventListener('abort',cancel,{once:true});contents.on?.('did-start-navigation',navigation);contents.on?.('destroyed',cancel);timer=setTimeout(cancel,2200);
 try{
  if(signal?.aborted){cancel();return null;}
  const result=await Promise.race([contents.executeJavaScript(`(${async function(apps,wanted,token,deadline){
   const key=Symbol.for('musebench.metaApps');
   if(Date.now()>=deadline||globalThis[key]?.token>=token)return null;
   globalThis[key]={token,active:true};
   const current=()=>Date.now()<deadline&&globalThis[key]?.token===token&&globalThis[key]?.active&&['https://www.meta.ai','https://meta.ai'].includes(location.origin)&&!location.username&&!location.password;
   if(!current())return null;
   const visible=e=>{
    if(!e||!e.getClientRects().length||e.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
    for(let node=e;node;node=node.parentElement){const s=getComputedStyle(node);if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||s.opacity==='0')return false;}
    return true;
   };
   const text=e=>(e.getAttribute('aria-label')||e.textContent||'').trim();
   const readRows=()=>{
   const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(d=>visible(d)&&(['Settings','Apps'].includes(d.getAttribute('aria-label'))||[...d.querySelectorAll('h1,h2,[role="heading"]')].some(h=>visible(h)&&text(h)==='Settings'))).filter(d=>[...d.querySelectorAll('h1,h2,h3,[role="heading"]')].some(h=>visible(h)&&['Apps','Unconnected apps','Connected apps'].includes(text(h))));
   if(dialogs.length!==1)return null;
   const dialog=dialogs[0],nodes=[...dialog.querySelectorAll('*')].filter(visible);
   const names=new Set(apps.map(a=>a.title));
   const labelNodes=nodes.filter(e=>names.has(text(e))&&![...e.children].some(child=>visible(child)&&text(child)===text(e)));
   let target=null;
   const items=apps.map(app=>{
    const labels=labelNodes.filter(e=>text(e)===app.title);let status='unknown';
    if(labels.length===1){
     let row=labels[0];
     for(let depth=0;row&&row!==dialog&&depth<7;depth++,row=row.parentElement){
      if(labelNodes.filter(e=>row.contains(e)).length!==1)break;
      const controls=[...row.querySelectorAll('button,a,[role="button"]')].filter(visible);
      if(!controls.length)continue;
      if(controls.length!==1)break;
      const control=controls[0],label=text(control);
      // A known name elsewhere in a group does not own a sibling provider's
      // control. The bounded row must contain only this exact app name and
      // its action, never another row, description or account status text.
      const identity=row.cloneNode(true);
      identity.querySelectorAll('button,a,[role="button"]').forEach(node=>node.remove());
      if((identity.textContent||'').replace(/\s+/g,' ').trim()!==app.title)break;
      if(label==='Connect'&&!control.disabled&&control.getAttribute('aria-disabled')!=='true'){
       status='unconnected';if(app.id===wanted)target=control;
      }else if(label==='Disconnect'||label==='Connected')status='connected';
      break;
     }
    }
    return {id:app.id,status};
   });
   if(wanted){
    if(!current())return null;
    if(target){target.click();return true;}
    return items.find(item=>item.id===wanted)?.status==='connected'?false:null;
   }
   return current()&&items.some(item=>item.status!=='unknown')?{status:'ready',items}:null;
   };
   // The Apps heading can render before its async inventory. Await actual
   // recognized rows, bounded by the same cancellable renderer deadline.
   while(current()){
    const result=readRows();if(result!==null)return result;
    await new Promise(resolve=>setTimeout(resolve,80));
   }
   return null;
  }.toString()})(${JSON.stringify(META_APPS)},${JSON.stringify(appId)},${token},${deadline})`,Boolean(appId)),cancellation]);
  return cancelled?null:result;
 }catch{return null;}finally{
  clearTimeout(timer);invalidate();signal?.removeEventListener('abort',cancel);contents.removeListener?.('did-start-navigation',navigation);contents.removeListener?.('destroyed',cancel);if(pending.get(contents)===cancel)pending.delete(contents);
 }
}
export async function readMetaApps(contents,options){
 const result=await inspect(contents,null,options);
 if(result?.status!=='ready'||!Array.isArray(result.items))return unavailable();
 return {status:'ready',items:META_APPS.map(({id})=>{const matches=result.items.filter(x=>x?.id===id);return {id,status:matches.length===1&&['connected','unconnected'].includes(matches[0].status)?matches[0].status:'unknown'};})};
}
export async function connectMetaApp(contents,appId,options){
 if(!META_APPS.some(app=>app.id===appId))return false;
 return await inspect(contents,appId,options)===true;
}
