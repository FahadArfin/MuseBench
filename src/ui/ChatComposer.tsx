import {useSlashPalette} from './SlashPalette';
import type {MuseSkill} from '../shared/slash-commands.mjs';
import {useEffect,useRef,useState,type Dispatch,type SetStateAction,type RefObject} from 'react';
import {Paperclip,ListPlus,ArrowUp,Check,ChevronDown,FolderOpen,Lightbulb,Mic,Plus,RotateCcw,Shield,ShieldCheck,Square,Terminal,X} from 'lucide-react';
import type {RunOptions} from '../shared/types';
import {REASONING_LEVELS} from '../shared/run-options.mjs';
import {useDictation} from './useDictation';
import './composer.css';
const labels:Record<RunOptions['reasoning'],string>={none:'None',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max',ultra:'Ultra'};
const approvals:{id:RunOptions['approval'];label:string;description:string}[]=[
 {id:'ask',label:'Ask for approval',description:'Safe actions run. Requests needing your approval stop the run.'},
 {id:'auto',label:'Auto-review',description:'Muse reviews eligible requests. Unresolved approvals stop the run.'},
 {id:'never',label:'No prompts',description:'Run without approval prompts, within the Muse sandbox.'},
];
type Props={onContext:()=>void;onCommand:(id:string,args:string,prefix:string)=>void;onLoadSkills:()=>void;skills:MuseSkill[];skillsStatus:string;theme:string;model:string;value:string;onChange:Dispatch<SetStateAction<string>>;inputRef:RefObject<HTMLTextAreaElement|null>;onSubmit:()=>void;onChooseProject:()=>void;onStop:()=>void;onConnection:()=>void;onOptions:(options:RunOptions)=>void;options:RunOptions;taskMode:'muse'|'manual'|'demo';onTaskMode:(mode:'muse'|'manual')=>void;messageMode:'chat'|'plan';onMessageMode:(mode:'chat'|'plan')=>void;showTask:boolean;busy:boolean;running:boolean;canSend:boolean;enterToSend:boolean;active:boolean;context:string;};
export function ChatComposer(p:Props){
 const [menu,setMenu]=useState<'add'|'approval'|'reasoning'|null>(null);
 const root=useRef<HTMLFormElement>(null),opener=useRef<HTMLElement|null>(null);
 const voice=useDictation(p.active&&!p.busy&&!p.running,p.context,p.onChange);
 const muse=p.taskMode==='muse',approval=approvals.find(item=>item.id===p.options.approval)!;
 const locked=p.busy||p.running||voice.recording;
 const slash=useSlashPalette({value:p.value,onChange:p.onChange,onCommand:(id,args,prefix)=>{if(id==='voice'){p.onChange(prefix);void voice.toggle();}else p.onCommand(id,args,prefix);},onLoadSkills:p.onLoadSkills,skills:p.skills,skillsStatus:p.skillsStatus,active:p.active&&!locked,context:p.context,options:p.options,plan:p.messageMode==='plan',theme:p.theme,model:p.model});
 const close=()=>{setMenu(null);opener.current?.focus();};
 const open=(kind:typeof menu,event:React.MouseEvent<HTMLButtonElement>)=>{opener.current=event.currentTarget;setMenu(menu===kind?null:kind);};
 useEffect(()=>{setMenu(null);},[p.active,p.context,p.showTask]);
 useEffect(()=>{
  if(!menu)return;
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setMenu(null);};
  const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(null);opener.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard,true);
  root.current?.querySelector<HTMLElement>('.composer-popover button,.composer-popover input,.composer-popover select')?.focus();
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard,true);};
 },[menu]);
 const choose=(options:RunOptions)=>{p.onOptions(options);close();};
 return <form ref={root} className="chat-composer codex-composer" onSubmit={event=>{event.preventDefault();if(!voice.recording&&!slash.submit())p.onSubmit();}}>
  {slash.node}
  <textarea aria-expanded={slash.open} aria-controls={slash.open?"muse-slash-options":undefined} aria-activedescendant={slash.open?`muse-slash-${slash.index}`:undefined} ref={p.inputRef} aria-label="Message Muse" rows={2} value={p.value} onChange={event=>p.onChange(event.target.value)} placeholder={p.running?'Write the next prompt while Muse works…':p.showTask?p.taskMode==='muse'?'Ask Muse anything about your project…':'Add a note to this chat…':'Ask Muse to build, fix, or explain something…'} maxLength={16000} disabled={p.busy} onKeyDown={event=>{if(slash.onKeyDown(event))return;if(event.key==='Enter'&&!event.nativeEvent.isComposing&&((event.ctrlKey||event.metaKey)||(p.enterToSend&&!event.shiftKey))){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
  {(voice.recording||voice.state.error||voice.hint)&&<div className={`dictation-status ${voice.state.error?'failed':''}`} role="status">{voice.recording?<><span className="listening-dot"/><span>{voice.state.status==='starting'?'Starting microphone…':voice.state.status==='stopping'?'Finishing dictation…':'Listening — speak naturally'}</span><button type="button" onClick={()=>void voice.toggle()} disabled={voice.state.status==='stopping'}>Stop</button></>:<><span>{voice.state.error||voice.hint}</span><button type="button" aria-label="Dismiss dictation notice" onClick={voice.cancel}><X size={13}/></button></>}</div>}
  <div className="composer-toolbar">
   <div className="composer-control"><button type="button" className="icon-button" aria-label="Add to chat" title="Add to chat" aria-expanded={menu==='add'} disabled={locked} onClick={e=>open('add',e)}><Plus size={20}/></button>
    {menu==='add'&&<div className="composer-popover add-popover" role="dialog" aria-label="Chat options"><span className="popover-label">Add</span><button type="button" className="composer-menu-row" onClick={()=>{close();p.onContext();}}><Paperclip size={16}/><span>Files & project context</span></button><button type="button" className="composer-menu-row" onClick={()=>{close();p.onChooseProject();}}><FolderOpen size={16}/><span>Choose project</span></button>
      <label className="composer-mode-row"><Terminal size={16}/><span>{p.showTask?'Conversation':'Chat type'}</span>{p.showTask?<select aria-label="Conversation mode" value={p.messageMode} onChange={e=>p.onMessageMode(e.target.value as 'chat'|'plan')} disabled={!muse}><option value="chat">{muse?'Muse':p.taskMode==='demo'?'Sample':'Notes'}</option><option value="plan">Plan</option></select>:<select aria-label="Task mode" value={p.taskMode} onChange={e=>p.onTaskMode(e.target.value as 'muse'|'manual')}><option value="muse">Muse</option><option value="manual">Manual</option></select>}</label>
      {muse&&<p className="popover-help">Plan mode guides the response; it does not prevent file edits or commands.</p>}
      <button type="button" className="composer-menu-row" onClick={()=>{close();p.onConnection();}}><ShieldCheck size={16}/><span>Muse connection</span></button></div>}
   </div>
   <div className="composer-control"><button type="button" className={`access-chip ${muse&&p.options.approval==='never'?'no-prompts':''}`} aria-label="Approval access" aria-expanded={menu==='approval'} disabled={locked||!muse} onClick={e=>open('approval',e)}><Shield size={14}/><span>{muse?approval.label:'Local notes'}</span></button>
    {menu==='approval'&&<div className="composer-popover approval-popover" role="menu" aria-label="Approval access options"><span className="popover-label">How should Muse actions be approved?</span>{approvals.map(item=><button type="button" key={item.id} className={`composer-menu-row approval-option ${p.options.approval===item.id?'selected':''}`} role="menuitemradio" aria-checked={p.options.approval===item.id} onClick={()=>choose({...p.options,approval:item.id})}><ShieldCheck size={16}/><span><strong>{item.label}</strong><small>{item.description}</small></span>{p.options.approval===item.id&&<Check size={15}/>}</button>)}<p className="popover-help"><ShieldCheck size={12}/>Sandbox stays on. Applies to your next request.</p></div>}
   </div>
   {p.messageMode==='plan'&&muse&&<span className="composer-plan-tag"><Lightbulb size={12}/>Plan</span>}
   <span className="composer-spacer"/>
   {muse&&<div className="composer-control"><button type="button" className="reasoning-chip" aria-label="Reasoning effort" aria-expanded={menu==='reasoning'} disabled={locked} onClick={e=>open('reasoning',e)}><strong>Muse</strong><span>{labels[p.options.reasoning]}</span><ChevronDown size={12}/></button>
    {menu==='reasoning'&&<div className="composer-popover reasoning-popover" role="dialog" aria-label="Reasoning controls"><div className="reasoning-heading"><div><strong>{labels[p.options.reasoning]}</strong><small>Muse reasoning effort</small></div><button type="button" className="icon-button" aria-label="Reset reasoning to High" onClick={()=>p.onOptions({...p.options,reasoning:'high'})}><RotateCcw size={14}/></button></div><input type="range" aria-label="Reasoning level" aria-valuetext={labels[p.options.reasoning]} min={0} max={REASONING_LEVELS.length-1} step={1} value={REASONING_LEVELS.indexOf(p.options.reasoning)} onChange={e=>p.onOptions({...p.options,reasoning:REASONING_LEVELS[Number(e.target.value)]})}/><div className="effort-scale"><span>Faster</span><span>Deeper</span></div><select aria-label="Select reasoning effort" value={p.options.reasoning} onChange={e=>choose({...p.options,reasoning:e.target.value as RunOptions['reasoning']})}>{REASONING_LEVELS.map(level=><option value={level} key={level}>{labels[level]}</option>)}</select><p className="popover-help">Higher effort can take longer and use more tokens.</p></div>}
   </div>}
   <button type="button" className={`icon-button microphone-button ${voice.recording?'recording':''}`} aria-label={voice.recording?'Stop dictation':'Start dictation'} title={voice.recording?'Stop dictation':voice.state.available===false?'Dictation unavailable on this device':'Dictate with Windows speech recognition (on device)'} disabled={p.busy||p.running||voice.state.status==='stopping'||(!voice.recording&&voice.state.available===false)} onClick={()=>{setMenu(null);void voice.toggle();}}>{voice.recording?<Square size={14} fill="currentColor"/>:<Mic size={17}/>}</button>
   {p.running?<><button type="submit" className="send-button queue-send" aria-label="Queue message" disabled={p.busy||!p.value.trim()}><ListPlus size={15}/>Queue</button><button type="button" className="send-button" aria-label="Stop Muse" onClick={p.onStop}><Square size={14} fill="currentColor"/></button></>:<button type="submit" className="send-button" aria-label={p.showTask?'Send message':'Create task'} title="Send" disabled={!p.value.trim()||locked||(p.showTask&&!p.canSend)}><ArrowUp size={19}/></button>}
  </div>
 </form>;
}
