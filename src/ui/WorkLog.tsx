import {useId,useState} from 'react';
import {Bot,ChevronRight,FilePenLine,FileSearch,FileText,Globe,LoaderCircle,Terminal,Wrench} from 'lucide-react';
import type {ActivityItem,ShellResult} from '../shared/types';
import {groupWorkLog,workLogItemLabel,type WorkLogCategory,type WorkLogGroup,type WorkLogItem} from '../shared/work-log.mjs';
import {MotionDisclosure} from './MotionDisclosure';
import './work-log.css';

function WorkIcon({category}:{category:WorkLogCategory}){
 const Icon=({command:Terminal,edit:FilePenLine,read:FileText,search:FileSearch,webSearch:Globe,webRead:Globe,agent:Bot,tool:Wrench})[category];
 return <Icon size={14} aria-hidden="true"/>;
}
const live=(status:string)=>['working','waiting','queued'].includes(status);
function WorkOutput({item}:{item:WorkLogItem}){
 const result=item.shellResult,output=result?.output??item.output;
 return <div className="work-log-output">
  {result?.command&&<><span>Command</span><pre tabIndex={0} aria-label="Command details">{result.command}</pre></>}
  {item.subject&&!result&&<p className="work-log-subject">{item.subject}</p>}
  {item.detail&&!['Completed','Running','Waiting to start','Native tool completed','Native tool request in progress'].includes(item.detail)&&<p>{item.detail}</p>}
  <pre tabIndex={0} aria-label="Activity output">{output||(live(item.status)?'No output reported yet.':'No output reported.')}</pre>
  {result&&<p>Exit {result.exitCode} · {result.terminalStatus==='failed'?'Failed':result.exitCode===0?'Completed':'Failed'}</p>}
  {(item.truncated||result?.truncated)&&<p>Only part of this output is retained.</p>}
 </div>;
}
function StatusHint({status}:{status:string}){
 if(status==='working')return <LoaderCircle size={12} className="work-spin work-log-spinner" aria-hidden="true"/>;
 if(['failed','waiting','interrupted','cancelled','queued'].includes(status))return <span className={`work-log-status work-log-status-${status}`}>{({failed:'Failed',waiting:'Waiting',interrupted:'Interrupted',cancelled:'Stopped',queued:'Queued'} as Record<string,string>)[status]}</span>;
 return null;
}
function WorkRow({item,initialOpen=false}:{item:WorkLogItem;initialOpen?:boolean}){
 const [open,setOpen]=useState(initialOpen),id=useId(),label=workLogItemLabel(item);
 return <div className="work-log-row" data-activity-id={item.id}>
  <button type="button" className="work-log-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} title={label}>
   <WorkIcon category={item.category}/><span className="work-log-label">{label}</span><StatusHint status={item.status}/><ChevronRight size={12} className={`work-disclosure ${open?'is-open':''}`} aria-hidden="true"/>
  </button>
  <MotionDisclosure id={id} open={open} unmountWhenClosed>{()=> <WorkOutput item={item}/>}</MotionDisclosure>
 </div>;
}
function WorkGroup({group}:{group:WorkLogGroup}){
 const [open,setOpen]=useState(false),id=useId();
 const single=group.items.length===1;
 return <div className="work-log-group" data-group-id={group.id} data-single={single}>
  <button type="button" className="work-log-toggle work-log-group-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} title={group.label}>
   <WorkIcon category={group.items[0].category}/><span className="work-log-label">{group.label}</span><StatusHint status={group.status}/><ChevronRight size={12} className={`work-disclosure ${open?'is-open':''}`} aria-hidden="true"/>
  </button>
  <MotionDisclosure id={id} open={open} innerClassName={`work-log-items ${single?'work-log-single':''}`} unmountWhenClosed>{()=>group.items.map(item=><WorkRow key={item.id} item={item} initialOpen={single}/>)}</MotionDisclosure>
 </div>;
}
export function WorkLog({activities,shellResults=[]}:{activities:ActivityItem[];shellResults?:ShellResult[]}){
 const groups=groupWorkLog(activities,shellResults);
 if(!groups.length)return null;
 return <div className="work-log" role="group" aria-label="Work log">{groups.map(group=><WorkGroup key={group.id} group={group}/>)}</div>;
}
