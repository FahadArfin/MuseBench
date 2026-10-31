import {useId,useState} from 'react';
import {ChevronDown,LoaderCircle,Pin,PinOff} from 'lucide-react';
import {MotionDisclosure} from './MotionDisclosure';
import type {MetaChatHistory as History,PersonalCommand} from '../shared/types';

export function MetaChatHistory({history,onCommand,available}:{history?:History;onCommand:(command:PersonalCommand)=>void;available:boolean}){
 const [expanded,setExpanded]=useState({pinned:false,recent:false}),[limits,setLimits]=useState({pinned:6,recent:6});
 const [selectedGroup,setSelectedGroup]=useState<'pinned'|'recent'>('recent');
 const listId=useId(),status=history?.status??'idle';
 const toggle=(group:'pinned'|'recent')=>{setExpanded(value=>({...value,[group]:!value[group]}));if(!expanded[group]&&status!=='loading')onCommand({type:'metaChats',action:'refresh'});};
 return <div className="meta-chat-history">{(['pinned','recent'] as const).map(group=>{
  const label=group==='pinned'?'Pinned chats':'Recents',items=(history?.items??[]).filter(item=>group==='recent'?item.recent!==false:item.pinned),open=expanded[group];
  return <section key={group} className="sidebar-section" aria-label={`Meta ${label}`}>
   <button type="button" className="sidebar-section-toggle" aria-label={`${open?'Collapse':'Expand'} Meta ${label}`} aria-expanded={open} aria-controls={`${listId}-${group}`} disabled={!available} onClick={()=>toggle(group)}>{label}<ChevronDown size={12} className={open?'':'folded'}/>{status==='loading'&&open&&<LoaderCircle size={11} className="spin" aria-label="Loading saved chats"/>}</button>
   <MotionDisclosure id={`${listId}-${group}`} open={open}>
    {items.slice(0,limits[group]).map(item=><div className="meta-history-row" key={item.id}><button type="button" className={`personal-item-row ${history?.selectedId===item.id&&selectedGroup===group?'selected':''}`} title={item.title} aria-current={history?.selectedId===item.id&&selectedGroup===group?'page':undefined} onClick={()=>{setSelectedGroup(group);onCommand({type:'metaChats',action:'open',id:item.id});}}><span>{item.title}</span></button><button type="button" className="meta-history-pin" aria-label={`${item.localPinned?'Unpin':'Pin'} ${item.title} in MuseBench`} title={item.providerPinned?'Pinned in Meta AI. This control manages your local MuseBench pin.':`${item.localPinned?'Unpin':'Pin'} in MuseBench for this Meta account`} aria-pressed={!!item.localPinned} onClick={()=>onCommand({type:'metaChats',action:'pin',id:item.id,pinned:!item.localPinned})}>{item.localPinned?<PinOff size={13}/>:<Pin size={13}/>}</button></div>)}
    {!items.length&&<p className="personal-collection-empty" role="status">{status==='loading'?'Loading saved chats…':status==='signed-out'?'Sign in to Meta AI to see saved chats.':status==='unavailable'?'Couldn’t load saved chats.':group==='pinned'?'Pin a recent chat to keep it here.':'No recent chats to show yet.'}</p>}
    {status==='unavailable'&&<button type="button" className="personal-show-more" onClick={()=>onCommand({type:'metaChats',action:'refresh'})}>Try again</button>}
    {items.length>limits[group]&&<button type="button" className="personal-show-more" aria-label={`Show more Meta ${label}`} onClick={()=>setLimits(value=>({...value,[group]:value[group]+6}))}>Show more</button>}
   </MotionDisclosure>
  </section>;
 })}</div>;
}
