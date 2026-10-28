import {useAccountUsage} from './AccountUsage';
import {usageHeadline} from '../shared/account-usage.mjs';
import './avatar-picker.css';
import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,CircleHelp,Gauge,Settings} from 'lucide-react';
import type {AccountProfile} from '../shared/types';
import {MuseAvatar,museAvatarIndex,museAvatarPresets} from './MuseAvatar';
import './profile-menu.css';

export type ProfileAction='profile'|'settings'|'usage'|'help';
type Props={open:boolean;onOpenChange:(open:boolean)=>void;onAction:(action:ProfileAction)=>void;compact?:boolean;profile?:AccountProfile|null;};

export function ProfileAvatar({profile,size=23}:{profile?:AccountProfile|null;size?:number}){
 const seed=profile?.avatarSeed||profile?.displayName||'musebench';
 const variant=museAvatarIndex(seed),preset=museAvatarPresets[variant];
 const photo=profile?.avatarImage&&/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(profile.avatarImage)&&profile.avatarImage.length<500000?profile.avatarImage:null;
 return <span className="profile-avatar" style={{background:`linear-gradient(145deg,${preset.colors[0]},${preset.colors[1]})`}} aria-hidden="true">{photo?<img src={photo} alt=""/>:<MuseAvatar variant={variant} size={size}/>}</span>;
}

export function ProfileMenu({open,onOpenChange,onAction,compact=false,profile}:Props){
 const {usage,loading}=useAccountUsage(open);
 const name=profile?.displayName.trim()||'Your account';
 const avatar=<ProfileAvatar profile={profile}/>;
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({left:8,bottom:68});
 const close=(restore=false)=>{onOpenChange(false);if(restore)trigger.current?.focus();};
 useLayoutEffect(()=>{
  if(!open)return;
  const positionMenu=()=>{const rect=trigger.current?.getBoundingClientRect();if(rect)setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-(menu.current?.offsetWidth??256)-8)),bottom:Math.max(8,window.innerHeight-rect.top+8)});};
  positionMenu();menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  const resized=()=>onOpenChange(false);
  window.addEventListener('resize',resized);return()=>window.removeEventListener('resize',resized);
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))onOpenChange(false);};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open,onOpenChange]);
 const key=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')??[]),current=items.indexOf(document.activeElement as HTMLButtonElement);
  const index=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[index]?.focus();
 };
 const choose=(action:ProfileAction)=>{onOpenChange(false);onAction(action);};
 return <div className={`profile-menu-anchor ${compact?'compact':'expanded'}`}>
  <button ref={trigger} type="button" className={compact?'rail-button profile-trigger':'profile-trigger'} aria-label="Profile menu" title={name} aria-haspopup="menu" aria-expanded={open} aria-controls={open?'workspace-profile-menu':undefined} onClick={()=>onOpenChange(!open)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();onOpenChange(true);}}}>
   <>{avatar}{!compact&&<><span className="profile-label"><strong>{name}</strong></span><ChevronDown size={14}/></>}</>
  </button>
  {open&&createPortal(<div ref={menu} id="workspace-profile-menu" className="profile-popover" role="menu" aria-label="Your profile" style={position} onKeyDown={key}>
   <button type="button" role="menuitem" tabIndex={-1} className="profile-menu-heading" aria-label={`View profile for ${name}`} onClick={()=>choose('profile')}>{avatar}<div><strong>{name}</strong><small>View profile</small></div><ChevronDown size={14} className="profile-menu-arrow"/></button>
   <div className="profile-menu-divider" role="separator"/>
   <button type="button" role="menuitem" aria-label="Usage" tabIndex={-1} onClick={()=>choose('usage')}><Gauge size={17}/><span>Usage</span><small>{loading?'Checking...':`${usage?.simulation?'Sample · ':''}${usageHeadline(usage)}`}</small></button>
   <button type="button" role="menuitem" tabIndex={-1} onClick={()=>choose('settings')}><Settings size={17}/><span>Settings</span><kbd>Ctrl+,</kbd></button>
   <button type="button" role="menuitem" tabIndex={-1} onClick={()=>choose('help')}><CircleHelp size={17}/><span>Help</span></button>
  </div>,document.body)}
 </div>;
}
