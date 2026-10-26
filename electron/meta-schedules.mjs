import {createHash} from 'node:crypto';
import {metaDocument} from './meta-navigation.mjs';

export function scheduledDocument(contents){
 return metaDocument(contents)&&new URL(contents.getURL()).pathname==='/scheduled';
}
// Read only rendered reminder cards. Suggestions never have an Edit control.
function scan(){
 if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin)||location.pathname!=='/scheduled')return null;
 const main=document.querySelector('main')||document.querySelector('[data-slot="sidebar-inset"]');
 if(!main||!main.querySelector('[data-testid="composer-input"]'))return null;
 return [...main.querySelectorAll('button[aria-label^="Edit "]')].slice(0,100).flatMap(edit=>{
  const card=edit.parentElement;
  const options=card?.querySelector('button[aria-label="Reminder options"]');
  if(!options)return [];
  const title=edit.getAttribute('aria-label').slice(5).trim();
  const spans=[...card.querySelectorAll('span')].map(e=>e.textContent.trim()).filter(Boolean);
  const timing=spans.filter(text=>text!==title).join(' · ');
  if(!title||title.length>240||timing.length>400)return [];
  return [{title,timing}];
 });
}
export function normalizeSchedules(rows){
 if(!Array.isArray(rows))return [];
 const items=rows.filter(row=>row&&typeof row.title==='string'&&row.title.length>0&&row.title.length<=240&&typeof row.timing==='string'&&row.timing.length<=400).slice(0,100).map(row=>({id:createHash('sha256').update(JSON.stringify([row.title,row.timing])).digest('hex').slice(0,24),title:row.title,timing:row.timing}));
 // Never guess which of two indistinguishable reminders the user intended.
 return items.map(item=>({...item,ambiguous:items.filter(other=>other.id===item.id).length>1})).filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index);
}
export async function readMetaSchedules(contents){
 if(!scheduledDocument(contents))return null;
 try{const rows=await contents.executeJavaScript(`(${scan.toString()})()`);return Array.isArray(rows)?{status:'ready',items:normalizeSchedules(rows)}:{status:'loading',items:[]};}catch{return {status:'unavailable',items:[]};}
}
export async function activateMetaSchedule(contents,item,action){
 if(!scheduledDocument(contents)||!item||item.ambiguous||!['edit','options','new'].includes(action))return false;
 try{
  const result=await contents.executeJavaScript(`(${function(item,action,scan){
   if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin)||location.pathname!=='/scheduled')return false;
   if(action==='new'){const composer=[...document.querySelectorAll('[data-testid="composer-input"]')].find(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);if(!composer)return false;composer.scrollIntoView({block:'nearest'});const r=composer.getBoundingClientRect();return r.width&&r.height?{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}:false;}
   if(document.querySelector('[role="dialog"],[role="menu"]'))return false;
   const matches=scan()?.filter(row=>row.title===item.title&&row.timing===item.timing);
   if(matches?.length!==1)return false;
   const edits=[...document.querySelectorAll('main button[aria-label^="Edit "],[data-slot="sidebar-inset"] button[aria-label^="Edit "]')];
   const edit=edits.find(e=>e.getAttribute('aria-label')==='Edit '+item.title&&[...e.parentElement.querySelectorAll('span')].map(e=>e.textContent.trim()).filter(text=>text&&text!==item.title).join(' · ')===item.timing);
   const target=action==='edit'?edit:edit?.parentElement.querySelector('button[aria-label="Reminder options"]');
   if(!target)return false;
   target.scrollIntoView({block:'nearest'});
   const r=target.getBoundingClientRect();return r.width&&r.height?{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}:false;
  }.toString()})(${JSON.stringify(item)},${JSON.stringify(action)},${scan.toString()})`);
  if(result===true){contents.focus();return true;}
  if(!result||!Number.isFinite(result.x)||!Number.isFinite(result.y)||result.x<0||result.y<0||!scheduledDocument(contents))return false;
  contents.focus();
  contents.sendInputEvent({type:'mouseDown',...result,button:'left',clickCount:1});
  contents.sendInputEvent({type:'mouseUp',...result,button:'left',clickCount:1});
  return true;
 }catch{return false;}
}
