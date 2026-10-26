import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Clock3,FolderOpen,Globe2,Home,Images,Layers3,MoreHorizontal,Pin,Puzzle,Search,Settings2,X} from 'lucide-react';
import type {CustomizeState} from '../shared/customize-types';
import './compact-navigation.css';

export const codeDestinations=[
 {id:'home',label:'Home',icon:Home},
 {id:'spaces',label:'Spaces',icon:Layers3},
 {id:'scheduled',label:'Scheduled',icon:Clock3},
 {id:'projects',label:'Projects',icon:FolderOpen},
 {id:'sites',label:'Sites',icon:Globe2},
 {id:'images',label:'Images',icon:Images},
] as const;
export type CodeDestination=typeof codeDestinations[number]['id'];
const storageKey='musebench-sidebar-shortcuts-v1';
type Plugin=CustomizeState['plugins'][number];
function readPins():string[]{
 try{const value=JSON.parse(localStorage.getItem(storageKey)||'null');if(Array.isArray(value))return [...new Set(value.filter((id):id is string=>typeof id==='string'&&(codeDestinations.some(d=>d.id===id)||id.startsWith('plugin:'))))].slice(0,100);}catch{/* Use defaults when preferences cannot be read. */}
 return codeDestinations.map(d=>d.id);
}

export function CompactNavigation({selected,onNavigate,onPlugin,onManage,revision,obscured}:{selected?:CodeDestination;onNavigate:(destination:CodeDestination)=>void;onPlugin:(plugin:Plugin)=>void;onManage:()=>void;revision:number;obscured:boolean}){
 const [pins,setPins]=useState(readPins),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[plugins,setPlugins]=useState<Plugin[]>([]),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [position,setPosition]=useState({left:60,top:12});
 const more=useRef<HTMLButtonElement>(null),popover=useRef<HTMLDivElement>(null),filter=useRef<HTMLInputElement>(null),generation=useRef(0),loadedRevision=useRef(-1);
 const close=(restore=false)=>{setOpen(false);if(restore)more.current?.focus();};
 useEffect(()=>{if(obscured)setOpen(false);},[obscured]);
 useEffect(()=>{
  if(!open&&(loadedRevision.current===revision||!pins.some(id=>id.startsWith('plugin:'))))return;
  const ticket=++generation.current;let alive=true;setStatus('Loading plugins…');
  if(!window.musebench){setStatus('Plugins are unavailable.');return;}
  window.musebench.customize({type:'refresh'}).then(result=>{if(!alive||ticket!==generation.current)return;loadedRevision.current=revision;setPlugins(result.state?.plugins||[]);setStatus(result.state?.errors.length?'Some plugins could not be loaded.':result.state?.plugins.length?'':'No plugins installed.');}).catch(()=>{if(alive)setStatus('Plugins could not be loaded. Open Customize to try again.');});
  return()=>{alive=false;};
 },[open,revision]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const rect=more.current?.getBoundingClientRect(),height=popover.current?.offsetHeight||480;if(rect)setPosition({left:Math.min(rect.right+10,window.innerWidth-336),top:Math.max(8,Math.min(rect.top,window.innerHeight-height-8))});};
  place();filter.current?.focus();const observer=new ResizeObserver(place);if(popover.current)observer.observe(popover.current);
  const resize=()=>close();window.addEventListener('resize',resize);return()=>{observer.disconnect();window.removeEventListener('resize',resize);};
 },[open]);
 useEffect(()=>{
  if(!open)return;const outside=(event:PointerEvent)=>{if(!popover.current?.contains(event.target as Node)&&!more.current?.contains(event.target as Node))close();};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 const toggle=(id:string)=>{const next=pins.includes(id)?pins.filter(p=>p!==id):[...pins,id];try{localStorage.setItem(storageKey,JSON.stringify(next));setPins(next);setError('');}catch{setError('Your shortcuts could not be saved. Please try again.');}};
 const choose=(destination:CodeDestination)=>{close();onNavigate(destination);};
 const openPlugin=(plugin:Plugin)=>{close();onPlugin(plugin);};
 const pinnedPlugins=pins.flatMap(id=>id.startsWith('plugin:')?plugins.filter(plugin=>`plugin:${plugin.id}`===id):[]);
 const matches=(name:string)=>name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
 return <nav className="compact-navigation" aria-label="Workspace shortcuts">
  <div className="compact-navigation-scroll">
   {pins.map(id=>{const item=codeDestinations.find(d=>d.id===id);if(!item)return null;const Icon=item.icon;return <button key={id} className={`compact-nav-button ${selected===id?'selected':''}`} aria-label={item.label} title={item.label} aria-current={selected===id?'page':undefined} onClick={()=>choose(item.id)}><Icon size={20} strokeWidth={1.7}/></button>;})}
   <button ref={more} className={`compact-nav-button ${open?'selected':''}`} aria-label="More sidebar shortcuts" title="More · Customize sidebar" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?'sidebar-shortcuts':undefined} onClick={()=>{setQuery('');setOpen(!open);}}><MoreHorizontal size={21}/></button>
   {!!pinnedPlugins.length&&<div className="compact-nav-divider"/>}
   {pinnedPlugins.map(plugin=><button key={plugin.id} className="compact-nav-button compact-plugin" aria-label={plugin.title} title={`${plugin.title} · Plugin details`} onClick={()=>openPlugin(plugin)}><Puzzle size={20}/><small aria-hidden="true">{plugin.title.slice(0,1).toUpperCase()}</small></button>)}
  </div>
  {open&&createPortal(<div ref={popover} id="sidebar-shortcuts" className="rail-shortcut-popover" role="dialog" aria-label="Sidebar shortcuts" style={position} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}if(event.key==='Tab'){const items=[...(popover.current?.querySelectorAll<HTMLElement>('button,input')||[])].filter(el=>el.checkVisibility());if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}}}}>
   <header><div><strong>Sidebar shortcuts</strong><p>Pin what you use most.</p></div><button className="icon-button" aria-label="Close sidebar shortcuts" onClick={()=>close(true)}><X size={16}/></button></header>
   <label className="rail-shortcut-search"><Search size={15}/><input ref={filter} aria-label="Find a shortcut" placeholder="Find a shortcut…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="rail-shortcut-list"><h3>Workspace</h3>{codeDestinations.filter(item=>matches(item.label)).map(item=><div className="rail-shortcut-row" key={item.id}><button onClick={()=>choose(item.id)}><item.icon size={18}/><span>{item.label}</span></button><button className="rail-shortcut-pin" aria-label={`${pins.includes(item.id)?'Unpin':'Pin'} ${item.label}`} aria-pressed={pins.includes(item.id)} title={`${pins.includes(item.id)?'Unpin':'Pin'} ${item.label}`} onClick={()=>toggle(item.id)}><Pin size={15}/></button></div>)}
    <h3>Installed plugins</h3>{plugins.filter(plugin=>matches(plugin.title)).map(plugin=><div className="rail-shortcut-row" key={plugin.id}><button title="Open plugin details" onClick={()=>openPlugin(plugin)}><Puzzle size={18}/><span>{plugin.title}<small>{!plugin.valid?'Needs attention':plugin.enabled?'Enabled':'Disabled'}</small></span></button><button className="rail-shortcut-pin" aria-label={`${pins.includes(`plugin:${plugin.id}`)?'Unpin':'Pin'} ${plugin.title}`} aria-pressed={pins.includes(`plugin:${plugin.id}`)} title={`${pins.includes(`plugin:${plugin.id}`)?'Unpin':'Pin'} ${plugin.title}`} onClick={()=>toggle(`plugin:${plugin.id}`)}><Pin size={15}/></button></div>)}
    {status&&<p className="rail-shortcut-status" role="status">{status}</p>}{query&&!codeDestinations.some(item=>matches(item.label))&&!plugins.some(item=>matches(item.title))&&<p className="rail-shortcut-status">No matching shortcuts.</p>}
   </div>{error&&<p className="rail-shortcut-status" role="alert">{error}</p>}<footer><button onClick={()=>{close();onManage();}}><Settings2 size={15}/>Manage plugins</button></footer>
  </div>,document.body)}
 </nav>;
}
