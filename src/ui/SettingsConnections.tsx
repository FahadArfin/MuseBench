import {useCallback,useEffect,useRef,useState} from 'react';
import {CalendarDays,Check,LoaderCircle,RefreshCw,UserRound,UsersRound,Utensils} from 'lucide-react';
import {META_APPS,type MetaAppsState} from '../shared/meta-apps.mjs';
import type {CustomizeTab} from '../shared/customize-types';
import type {PersonalCommand} from '../shared/types';
import './settings-connections.css';

const assets=import.meta.glob<string>('./assets/connected-apps/*.svg',{eager:true,query:'?url&inline',import:'default'});
const brandFiles:Record<string,string>={'google-drive':'google-drive-2020',gmail:'google-gmail-2020','google-calendar':'google-calendar-2020','outlook-email':'microsoftoutlook'};
function AppIcon({id}:{id:string}){
 const file=brandFiles[id],asset=file&&assets[`./assets/connected-apps/${file}.svg`];
 const Glyph=id==='opentable'?Utensils:id==='outlook-calendar'?CalendarDays:id==='outlook-people'?UsersRound:UserRound;
 return <span className={`settings-app-icon app-${id}`} aria-hidden="true">{asset?(id==='outlook-email'?<span className="settings-app-logo-mask" style={{mask:`url("${asset}") center / contain no-repeat`,WebkitMask:`url("${asset}") center / contain no-repeat`}}/>:<img src={asset} alt=""/>):<Glyph size={23} strokeWidth={2}/>}</span>;
}
export type AccountSettingsCommand=Extract<PersonalCommand,{type:'metaSettings'|'serviceAction'|'metaApps'}>;
type Props={openCustomize:(tab?:CustomizeTab)=>void;openAccountSettings:(command:AccountSettingsCommand)=>void};
export function SettingsConnections({openCustomize,openAccountSettings}:Props){
 const [state,setState]=useState<MetaAppsState>({status:'idle',items:[]}),[pending,setPending]=useState(false);
 const mounted=useRef(false),inFlight=useRef(false),lastRefresh=useRef(0);
 const refresh=useCallback(async()=>{
  if(inFlight.current)return;inFlight.current=true;setPending(true);lastRefresh.current=Date.now();
  try{const result=await window.musebench?.personal({type:'metaApps',action:'refresh'});if(mounted.current)setState(result?.metaApps??{status:'unavailable',items:[],message:'Open Meta AI settings to check your connected apps.'});}
  catch{if(mounted.current)setState({status:'unavailable',items:[],message:'Could not check your connected apps. Try refreshing or open Meta AI settings.'});}
  finally{inFlight.current=false;if(mounted.current)setPending(false);}
 },[]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  const unsubscribe=window.musebench?.onPersonalState(value=>{if(mounted.current&&value.metaApps)setState(value.metaApps);});
  const focus=()=>{if(Date.now()-lastRefresh.current>5000)void refresh();};window.addEventListener('focus',focus);
  return()=>{mounted.current=false;unsubscribe?.();window.removeEventListener('focus',focus);};
 },[refresh]);
 const loading=pending||state.status==='loading';
 const statusFor=(id:string)=>state.status==='ready'?state.items.find(item=>item.id===id)?.status??'unknown':'unknown';
 const connected=META_APPS.filter(app=>statusFor(app.id)==='connected'),other=META_APPS.filter(app=>statusFor(app.id)!=='connected');
 const group=(title:string,apps:typeof META_APPS)=><section className="settings-app-group" aria-label={title}><h4>{title}</h4><div className="settings-app-list">{apps.map(app=>{
  const connected=statusFor(app.id)==='connected';
  return <div className="settings-app-row" key={app.id}><AppIcon id={app.id}/><span className="settings-app-name">{app.title}</span>{connected&&<span className="settings-app-connected"><Check size={13}/><span>Connected</span></span>}<button type="button" disabled={loading} className="settings-app-connect" aria-label={`${connected?'Manage':'Connect'} ${app.title}`} onClick={()=>openAccountSettings(connected?{type:'metaSettings',section:'apps'}:{type:'metaApps',action:'connect',appId:app.id})}>{connected?'Manage':'Connect'}</button></div>;
 })}</div></section>;
 return <section className="settings-section settings-connections"><div className="settings-connections-heading"><div><h3>Connections</h3><p className="settings-description">Connect your apps to Meta AI.</p></div><button type="button" className="icon-button" aria-label="Refresh connected apps" title="Refresh connected apps" disabled={loading} onClick={()=>void refresh()}>{loading?<LoaderCircle size={16} className="spin"/>:<RefreshCw size={16}/>}</button></div>
  {connected.length>0&&group('Connected apps',connected)}
  {other.length>0&&group(other.every(app=>statusFor(app.id)==='unconnected')?'Unconnected apps':'Apps',other)}
  <p className="settings-app-status" role="status">{loading?'Checking connection status…':state.message||(state.status==='ready'?'Connection status from Meta AI.':'Connection status is unavailable. Connect opens Meta’s official app settings.')}</p>
  <p className="settings-note">Choose Connect to continue with Meta’s sign-in and permissions. These connections are used by Meta AI.</p>
  <div className="settings-connections-links"><button type="button" aria-label="Open Meta AI settings and plan" onClick={()=>openAccountSettings({type:'metaSettings',section:'general'})}>Meta AI settings &amp; plan</button><button type="button" aria-label="Open Muse connected apps" onClick={()=>openAccountSettings({type:'serviceAction',action:'connections'})}>Muse apps</button><button type="button" aria-label="Open coding connectors" onClick={()=>openCustomize('connectors')}>Coding connectors</button></div>
 </section>;
}
