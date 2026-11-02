const clean=(value,max=1200)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';
const name=tool=>String(tool??'').replace(/^tool\./,'');
export function toolCategory(tool){
 const key=name(tool);
 if(['powershell','shell','bash','command','terminal'].includes(key))return 'command';
 if(['write_file','edit_file','apply_patch'].includes(key))return 'edit';
 if(['read_file'].includes(key))return 'read';
 if(['search','grep','glob','list_directory'].includes(key)||/workspace_tool_(search|call|batch)$/.test(key))return 'search';
 if(key==='web_search')return 'webSearch';
 if(['web_fetch','mcp__musebench_web__read_web_page'].includes(key))return 'webRead';
 return 'tool';
}
const words={command:['Ran','Run','a command','commands'],edit:['Edited','Edit','a file','files'],read:['Read','Read','a file','files'],search:['Searched','Search','files','files'],webSearch:['Searched','Search','the web','the web'],webRead:['Read','Read','a webpage','webpages'],tool:['Used','Use','a tool','tools'],agent:['Agent','Agent','activity','activities']};
export function toolSubject(tool,args){
 if(typeof args!=='string'||args.length>65536)return '';
 let value;try{value=JSON.parse(args);}catch{return '';}
 if(!value||typeof value!=='object'||Array.isArray(value))return '';
 const category=toolCategory(tool);
 if(category==='command')return clean(value.command);
 if(['read','edit'].includes(category))return clean(value.path??value.file_path);
 if(['search','webSearch'].includes(category))return clean(value.query??value.pattern);
 if(category==='webRead'){
  try{const url=new URL(value.url);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?clean(url.href):'';}catch{return '';}
 }
 return '';
}
export function workLogItemLabel(item){
 const category=item.category??toolCategory(item.tool),[past,verb,noun]=words[category]??words.tool;
 const subject=clean(item.subject);
 if(item.kind==='agent')return `${clean(item.title,160)||'Agent'} · ${item.status==='completed'?'finished':item.status==='working'?'working':item.status}`;
 if(item.status==='completed')return `${past} ${subject||noun}`;
 if(item.status==='working')return `${category==='command'?'Running':category==='edit'?'Editing':category==='read'||category==='webRead'?'Reading':category==='search'||category==='webSearch'?'Searching':'Using'} ${subject||noun}`;
 return `${verb} ${subject||noun} · ${{failed:'failed',interrupted:'interrupted',cancelled:'stopped',waiting:'waiting for approval',queued:'queued'}[item.status]??'status not reported'}`;
}
function summary(items,status){
 if(items.length===1)return workLogItemLabel(items[0]);
 if(status!=='completed')return `${items.length} actions · ${{working:'working',waiting:'waiting for input',queued:'queued',failed:'failed',interrupted:'interrupted',cancelled:'stopped'}[status]??status}`;
 const counts=new Map();for(const item of items)counts.set(item.category,(counts.get(item.category)??0)+1);
 return [...counts].map(([category,count],i)=>{
  const [past,,single,plural]=words[category]??words.tool;
  return `${i?past.toLowerCase():past} ${count===1?single:['search','webSearch'].includes(category)?`${count} searches`:count+' '+plural}`;
 }).join(', ');
}
/** Display-only projection. No run completion or control authority is inferred. */
export function groupWorkLog(activities=[],shellResults=[]){
 const results=new Map(shellResults.slice(0,64).map(r=>[r.callId,r])),used=new Set(),groups=[];let current=null;
 const add=item=>{
  if(!current){current={id:item.id,items:[]};groups.push(current);}current.items.push(item);
 };
 for(const source of activities.slice(0,120)){
  if(source.kind==='model'){current=null;continue;}
  if(!['tool','agent'].includes(source.kind))continue;
  const category=source.kind==='agent'?'agent':toolCategory(source.tool);
  const result=category==='command'&&source.callId?results.get(source.callId):null;
  if(result)used.add(result.callId);
  const item={...source,category,subject:clean(result?.command??source.subject),...(result?{shellResult:result,...(result.terminalStatus==='failed'||result.exitCode!==0?{status:'failed'}:{})}:{})};
  if(source.kind==='agent'){current=null;add(item);current=null;}else add(item);
 }
 // Historical receipts without a native call binding are intentionally separate;
 // their order/association with an old lifecycle row cannot be reconstructed.
 current=null;
 for(const result of results.values())if(!used.has(result.callId))add({id:'shell:'+result.runId+':'+result.callId,kind:'tool',tool:'powershell',category:'command',status:result.terminalStatus==='completed'&&result.exitCode===0?'completed':'failed',subject:clean(result.command),output:'',detail:'',shellResult:result});
 for(const group of groups){group.status=['working','waiting','queued','failed','interrupted','cancelled'].find(status=>group.items.some(item=>item.status===status))??'completed';group.label=summary(group.items,group.status);}
 return groups;
}
