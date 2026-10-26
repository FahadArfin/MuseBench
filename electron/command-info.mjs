import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const clean=(value,max=200)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').slice(0,max):'';
export function normalizeSkills(value){
 return (Array.isArray(value?.skills)?value.skills:[]).filter(s=>s&&['on','user-only','user-invocable-only'].includes(s.activation)&&typeof s.id==='string'&&/^[-\w:./]+$/.test(s.id)&&s.id.length<=200).slice(0,250).map(s=>({id:s.id,name:clean(s.name||s.id),title:clean(s.display_name||s.name||s.id),description:clean(s.short_description||s.description,500),scope:({bundled:'Bundled',user:'Personal',project:'Project',plugin:'Plugin'})[s.scope]??'Muse'}));
}
export function usageSummary(value){
 const rows=[];
 const walk=(item,prefix='',depth=0)=>{
  if(!item||typeof item!=='object'||depth>5)return;
  for(const [key,v]of Object.entries(item)){
   if(/credential|secret|token$|account|email|user|key|authorization/i.test(key))continue;
   const label=[prefix,key.replaceAll('_',' ')].filter(Boolean).join(' · ');
   if(v&&typeof v==='object')walk(v,label,depth+1);
   else if(/used|limit|remaining|reset|total|percent|window|period|allowance|balance|plan/i.test(key)&&['number','string','boolean'].includes(typeof v))rows.push({label:clean(label,140),value:clean(String(v),120)});
   if(rows.length>=40)return;
  }
 };
 walk(value);return rows.slice(0,40);
}
export function createCommandInfo({getState,run=promisify(execFile)}){
 return async type=>{
  if(!['skills','usage'].includes(type))throw Error('Unsupported information command.');
  const state=getState(),binary=state.runtime?.binary;
  if(typeof binary!=='string'||!(path.isAbsolute(binary)||path.win32.isAbsolute(binary))||!binary.toLowerCase().endsWith('.exe'))return{status:'unavailable',message:'Install or select the official Muse CLI in Connection settings.',skills:[]};
  const args=type==='skills'?['skills','list','--enabled-only','--json']:['usage','--json'];
  if(type==='skills'&&state.activeProject?.root)args.push('--workspace',state.activeProject.root);
  try{
   const {stdout}=await run(binary,args,{windowsHide:true,shell:false,timeout:15000,maxBuffer:1024*1024,encoding:'utf8'});
   const parsed=JSON.parse(stdout);
   return type==='skills'?{status:'ready',skills:normalizeSkills(parsed)}:{status:'ready',rows:usageSummary(parsed)};
  }catch{return{status:'unavailable',message:type==='usage'?'Muse could not refresh your allowance. Check your official CLI sign-in or open Meta billing.':'Muse could not load its skill catalog. Check the selected CLI and try again.',skills:[]};}
 };
}
export function exportTranscript(state){
 const task=state.task;if(!task)throw Error('Open a chat to export it.');let first=true;
 const messages=(task.messages??[]).filter(m=>{if(m.role==='system')return false;if(m.role==='user'&&first){first=false;if(m.text===task.request)return false;}return true;});
 return `# ${task.title}\n\n## You\n\n${task.request}\n\n${messages.map(m=>`## ${m.role==='user'?'You':'Muse'}\n\n${m.text}`).join('\n\n')}\n`;
}
