import {createHash} from 'node:crypto';
import {metaDocument} from './meta-navigation.mjs';

const text=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
function chatPath(value){
 if(typeof value!=='string'||value.length>500||!/^\/(?:conversation|c|prompt)\/[A-Za-z0-9_-]{1,200}$/.test(value))return null;
 return value;
}
export function normalizeMetaChatRows(input,owner){
 if(typeof owner!=='string'||!owner||!Array.isArray(input))return [];
 const rows=input.slice(0,500).flatMap(row=>{
  const title=text(row?.title).slice(0,240),label=text(row?.label).slice(0,600),path=row?.path==null?null:chatPath(row.path);
  if(!title||!label||row?.path!=null&&!path)return [];
  const key=path??title;
  return [{id:createHash('sha256').update(owner+'\0'+key).digest('hex').slice(0,24),title,label,path,pinned:row.pinned===true}];
 });
 const groups=new Map();for(const row of rows){const group=groups.get(row.id)??[];group.push(row);groups.set(row.id,group);}
 return [...groups.values()].flatMap(group=>group.length===1?[group[0]]:group[0].path&&group.every(row=>row.path===group[0].path)?[{...group.at(-1),pinned:group.some(row=>row.pinned)}]:[]);
}

// Only the rendered, empty-query Search list is read. No messages, storage,
// credentials, framework internals or undocumented provider APIs are accessed.
function renderedRows(){
 if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin))return null;
 const input=document.querySelector('[role="dialog"] input[placeholder="Search chats"]');
 if(!input||input.value.trim())return null;
 const dialog=input.closest('[role="dialog"]'),rows=[];
 const clean=value=>(value??'').replace(/\s+/g,' ').trim();
 let recognized=false;
 for(const group of [...dialog.querySelectorAll('[role="group"]')].slice(0,30)){
  const heading=clean(group.getAttribute('aria-label')||(group.getAttribute('aria-labelledby')??'').split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' ')||group.querySelector('[cmdk-group-heading],[data-slot="command-group-heading"]')?.textContent);
  if(!/^(recent|recents|pinned|pinned chats|all chats|chat history)$/i.test(heading))continue;
  recognized=true;
  for(const option of [...group.querySelectorAll('[role="option"]')].slice(0,500-rows.length)){
   const walker=document.createTreeWalker(option,NodeFilter.SHOW_TEXT);let node,title='';
   while((node=walker.nextNode())){title=clean(node.textContent);if(title)break;}
   const label=clean(option.textContent),link=option.matches('a[href]')?option:option.querySelector('a[href]');
   let path=null;
   if(link){try{const url=new URL(link.getAttribute('href'),location.href);path=url.origin===location.origin&&!url.search&&!url.hash&&!url.username&&!url.password?url.pathname:'invalid';}catch{path='invalid';}}
   if(title&&label)rows.push({title,label,path,pinned:/^pinned/i.test(heading)});
  }
 }
 return recognized?rows:null;
}

async function bounded(contents,source){
 let timer;try{return await Promise.race([contents.executeJavaScript(source,true),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);timer.unref?.();})]);}catch{return null;}finally{clearTimeout(timer);}
}
export async function readMetaChatRows(contents){
 if(!metaDocument(contents))return null;
 const rows=await bounded(contents,`(${renderedRows.toString()})()`);
 return Array.isArray(rows)?rows:null;
}
export async function openMetaChatRow(contents,row){
 if(!metaDocument(contents)||!row||!text(row.label)||row.path!=null&&!chatPath(row.path))return false;
 return await bounded(contents,`(${async function(target){
  if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin))return false;
  const input=document.querySelector('[role="dialog"] input[placeholder="Search chats"]');if(!input||input.value.trim())return false;
  const clean=value=>(value??'').replace(/\s+/g,' ').trim();
  const matches=[...input.closest('[role="dialog"]').querySelectorAll('[role="option"]')].filter(option=>{if(target.path){const link=option.matches('a[href]')?option:option.querySelector('a[href]');try{const url=new URL(link?.getAttribute('href'),location.href);return url.origin===location.origin&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname===target.path;}catch{return false;}}return clean(option.textContent)===target.label;});
  if(!matches.length||!target.path&&matches.length!==1)return false;
  matches[0].click();const end=Date.now()+3000;
  while(Date.now()<end){
   if(!['https://www.meta.ai','https://meta.ai'].includes(location.origin))return false;
   if(/^\/(?:conversation|c|prompt)\/[A-Za-z0-9_-]{1,200}$/.test(location.pathname)&&(!target.path||location.pathname===target.path)&&!document.querySelector('[role="dialog"] input[placeholder="Search chats"]'))return true;
   await new Promise(resolve=>setTimeout(resolve,40));
  }
  return false;
 }.toString()})(${JSON.stringify({label:row.label,path:row.path})})`)===true;
}
