import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {Zap,MessageSquare,Target,Cable,Brain,Box,CircleUserRound,Lightbulb,CirclePlus,Pencil,Gauge,ShieldCheck,BookOpen,SquarePen,History,Files,PanelRight,CheckCheck,Copy,Download,ListChecks,FileText,Settings2,SunMoon,Terminal,Unplug,Square,FolderOpen,Folder,CircleHelp,Blocks,Bot,LogOut,GitBranch,Mic,ChevronLeft,ChevronRight,type LucideIcon} from 'lucide-react';
const ICONS:Record<string,LucideIcon>={Zap,MessageSquare,Target,Cable,Brain,Box,CircleUserRound,Lightbulb,CirclePlus,Pencil,Gauge,ShieldCheck,BookOpen,SquarePen,History,Files,PanelRight,CheckCheck,Copy,Download,ListChecks,FileText,Settings2,SunMoon,Terminal,Unplug,Square,FolderOpen,Folder,CircleHelp,Blocks,Bot,LogOut,GitBranch,Mic,ChevronLeft,ChevronRight};
import {filterCommands,findCommand,parseSlashInput,parseSlashSubmission,skillPrompt,type MuseSkill,type SlashEntry,type SlashInput} from '../shared/slash-commands.mjs';
import {REASONING_LEVELS} from '../shared/run-options.mjs';
import type {RunOptions} from '../shared/types';
import './slash.css';
type Props={value:string;onChange:(text:string)=>void;onCommand:(id:string,args:string,prefix:string)=>void;onLoadSkills:()=>void;skills:MuseSkill[];skillsStatus:string;active:boolean;context:string;options:RunOptions;plan:boolean;theme:string;model:string;};
const efforts:Record<string,string>={none:'None',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max',ultra:'Ultra'};
export function useSlashPalette(p:Props){
 const [selected,setSelected]=useState(0),[submenu,setSubmenu]=useState<string|null>(null),[dismissed,setDismissed]=useState<string|null>(null);
 const list=useRef<HTMLDivElement>(null),parsed=parseSlashInput(p.value);
 const open=Boolean(p.active&&parsed&&dismissed!==p.value);
 useEffect(()=>{setSelected(0);setSubmenu(null);},[p.value,p.context]);
 useEffect(()=>{if(open)p.onLoadSkills();},[open,p.context]);
 useEffect(()=>{if(!p.active){setSubmenu(null);setDismissed(p.value);}},[p.active]);
 let entries=filterCommands(parsed?.name??'',p.skills);
 if(submenu==='reasoning')entries=REASONING_LEVELS.map(level=>({id:`reasoning:${level}`,label:efforts[level],description:p.options.reasoning===level?'Selected':'',icon:'Brain',kind:'value',aliases:[]}));
 if(submenu==='approval')entries=[['ask','Ask for approval','Safe actions run; approval requests stop'],['auto','Auto-review','Muse reviews eligible requests'],['never','No prompts','Run without approval prompts']].map(([value,label,description])=>({id:`approval:${value}`,label,description,icon:'ShieldCheck',kind:'value',aliases:[]}));
 if(submenu==='theme')entries=['system','light','dark'].map(value=>({id:`theme:${value}`,label:value[0].toUpperCase()+value.slice(1),description:p.theme===value?'Selected':'',icon:'SunMoon',kind:'value',aliases:[]}));
 if(submenu==='model')entries=[{id:'model:status',label:'Model settings',description:'Reported model and next-request choices',icon:'Box',kind:'value',aliases:[]},{id:'reasoning',label:'Reasoning effort',description:`Next request · ${efforts[p.options.reasoning]}`,icon:'Brain',kind:'submenu',aliases:[]}];
 if(submenu==='skills')entries=filterCommands('',p.skills).filter(entry=>entry.kind==='skill');
 const index=Math.min(selected,Math.max(0,entries.length-1));
 useEffect(()=>{list.current?.querySelector<HTMLElement>(`[data-option-index="${index}"]`)?.scrollIntoView({block:'nearest'});},[index,submenu,p.value]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{const element=event.target as Element;if(!element.closest('.codex-composer'))setDismissed(p.value);};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open,p.value]);
 const choose=(entry:SlashEntry,input:SlashInput|null=parsed)=>{
  if(!input)return;
  if(entry.kind==='submenu'){if(!parsed)p.onChange([input.prefix,`/${entry.id}`].filter(Boolean).join('\n'));setDismissed(null);setSubmenu(entry.id);setSelected(0);return;}
  setDismissed(p.value);setSubmenu(null);
  if(entry.skill){p.onChange(skillPrompt(entry.skill,[input.prefix,input.args].filter(Boolean).join('\n\n')));return;}
  const [id,arg]=entry.kind==='value'?entry.id.split(':'):[entry.id,input.args];
  p.onCommand(id,arg??'',input.prefix);
 };
 const submit=()=>{
  const input=parseSlashSubmission(p.value);if(!input)return false;
  const exact=findCommand(input.name),skill=p.skills.find(item=>item.available!==false&&(item.name===input.name||item.id===input.name));
  if(open&&submenu&&entries.length){choose(entries[index]);return true;}
  if(input.args&&exact){p.onCommand(exact.id,input.args,input.prefix);setDismissed(p.value);return true;}
  if(open&&entries.length){choose(entries[index]);return true;}
  if(exact){choose(exact,input);return true;}
  if(skill){p.onChange(skillPrompt(skill,[input.prefix,input.args].filter(Boolean).join('\n\n')));return true;}
  p.onCommand('unknown',input.name,input.prefix);setDismissed(p.value);return true;
 };
 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
  if(!open||event.nativeEvent.isComposing)return false;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(submenu){setSubmenu(null);setSelected(0);}else setDismissed(p.value);return true;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();setSelected(current=>event.key==='Home'?0:event.key==='End'?Math.max(0,entries.length-1):(current+(event.key==='ArrowDown'?1:-1)+entries.length)%Math.max(1,entries.length));return true;
  }
  if(event.key==='ArrowLeft'&&submenu){event.preventDefault();setSubmenu(null);setSelected(0);return true;}
  if(event.key==='ArrowRight'&&entries[index]?.kind==='submenu'){event.preventDefault();choose(entries[index]);return true;}
  if((event.key==='Enter'&&!event.shiftKey)||event.key==='Tab'){event.preventDefault();submit();return true;}
  return false;
 };
 const description=(entry:SlashEntry)=>entry.id==='reasoning'?efforts[p.options.reasoning]:entry.id==='plan'?`Turn plan mode ${p.plan?'off':'on'}`:entry.id==='fast'?(p.options.reasoning==='low'?'Low reasoning enabled':'Lower reasoning effort, quicker replies'):entry.id==='model'?(p.model||'Muse provider default'):entry.description;
 const node=open?<div className="slash-palette" aria-label="Command menu">
  {submenu&&<button type="button" className="slash-back" onMouseDown={event=>event.preventDefault()} onClick={()=>{setSubmenu(null);setSelected(0);}}><ChevronLeft size={14}/>{findCommand(submenu)?.label}</button>}
  <div ref={list} className="slash-scroll" role="listbox" id="muse-slash-options" aria-label={submenu?`${submenu} commands`:'Slash commands'}>
   {entries.map((entry,i)=>{const Icon=ICONS[entry.icon]??Terminal;const group=entry.kind==='skill'?'Skills':i>0&&entries[i-1]?.kind==='skill'?'Workspace':null;return <div key={entry.id}>
    {group&&(i===0||entries[i-1]?.kind!=='skill'||group==='Workspace')&&<div className="slash-group">{group}</div>}
    <button id={`muse-slash-${i}`} type="button" role="option" aria-selected={i===index} data-option-index={i} className={`slash-option ${i===index?'selected':''}`} onMouseDown={event=>event.preventDefault()} onMouseMove={()=>setSelected(i)} onClick={()=>choose(entry)} title={`/${entry.skill?.name??entry.id} — ${description(entry)}`}>
     <Icon size={15}/><span className="slash-label">{entry.label}</span><span className="slash-description">{description(entry)}</span>{entry.skill?<span className="slash-scope">{entry.skill.scope}</span>:entry.kind==='submenu'?<ChevronRight className="slash-chevron" size={14}/>:entry.kind==='info'?<span className="slash-scope">Info</span>:null}
    </button></div>;})}
   {!entries.length&&<div className="slash-empty">{submenu==='skills'?(p.skillsStatus==='loading'?'Loading Muse skills…':'No enabled skills available. Check Muse connection settings.'):'No matching commands. Try /help.'}</div>}
  </div>
 </div>:null;
 return{node,open,index,onKeyDown,submit};
}
