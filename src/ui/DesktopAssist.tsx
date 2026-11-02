import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Monitor,ShieldCheck,Square} from 'lucide-react';
import type {DesktopAssistCommand,DesktopAssistState} from '../shared/desktop-assist-types';
import './DesktopAssist.css';

type DesktopBridge={desktopAssist?:(command:DesktopAssistCommand)=>Promise<DesktopAssistState>;onDesktopAssist?:(listener:(state:DesktopAssistState)=>void)=>()=>void};
const unavailable:DesktopAssistState={supported:false,available:false,enabled:false,stopped:false,active:null,pending:null,allowedApps:[]};
function useDesktopAssist(){
 const [state,setState]=useState<DesktopAssistState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stopping,setStopping]=useState(false);
 const mounted=useRef(false),version=useRef(0),operation=useRef(false),stopOperation=useRef(false);
 useEffect(()=>{
  mounted.current=true;let active=true;
  const api=window.musebench as DesktopBridge|undefined;
  if(!api?.desktopAssist){setState(unavailable);return()=>{mounted.current=false;};}
  const apply=(value:DesktopAssistState)=>{if(active&&mounted.current){version.current++;setState(value);}};
  const off=api.onDesktopAssist?.(apply),initialVersion=version.current;
  void api.desktopAssist({type:'status'}).then(value=>{if(active&&mounted.current&&version.current===initialVersion)apply(value);}).catch(reason=>{if(active&&mounted.current&&version.current===initialVersion)setError(reason instanceof Error?reason.message:'Could not read Desktop Assist status.');});
  return()=>{active=false;mounted.current=false;off?.();};
 },[]);
 const command=useCallback(async(input:DesktopAssistCommand)=>{
  const api=window.musebench as DesktopBridge|undefined,isStop=input.type==='stop';
  if(!api?.desktopAssist||!mounted.current||(isStop?stopOperation.current:operation.current))return;
  if(isStop){stopOperation.current=true;setStopping(true);}else{operation.current=true;setBusy(true);}
  setError('');const startVersion=version.current;
  try{
   const value=await api.desktopAssist(input);
   if(mounted.current&&version.current===startVersion){version.current++;setState(value);}
  }catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'Desktop Assist could not complete that request. Try again.');}
  finally{if(isStop){stopOperation.current=false;if(mounted.current)setStopping(false);}else{operation.current=false;if(mounted.current)setBusy(false);}}
 },[]);
 return{state,error:error||state?.error||'',busy,stopping,command};
}
type Assist=ReturnType<typeof useDesktopAssist>;
function AssistError({error}:{error:string}){return error?<p className="desktop-assist-error" role="alert">{error}</p>:null;}
function StopButton({assist}:{assist:Assist}){return <button type="button" className="button compact desktop-assist-stop" disabled={assist.stopping} onClick={()=>void assist.command({type:'stop'})}><Square size={12}/>{assist.stopping?'Stopping…':'Stop immediately'}</button>;}
function PermissionCard({assist,ownerHint}:{assist:Assist;ownerHint?:string}){
 const pending=assist.state?.pending;
 const [expired,setExpired]=useState(false);
 useEffect(()=>{
  if(!pending)return;
  const remaining=pending.expiresAt-Date.now();setExpired(remaining<=0);
  if(remaining<=0)return;
  const timer=window.setTimeout(()=>setExpired(true),Math.min(remaining,2147483647));
  return()=>window.clearTimeout(timer);
 },[pending?.id,pending?.expiresAt]);
 if(!pending)return null;
 const disabled=assist.busy||!assist.state?.supported||!assist.state.available||!assist.state.enabled||assist.state.stopped;
 const decide=(decision:'allow'|'always'|'deny')=>{if(Date.now()<pending.expiresAt)void assist.command({type:'decide',id:pending.id,decision});};
 return <div className="desktop-assist-request" role="group" aria-label={`Desktop access request for ${pending.appName}`}>
  <strong>Allow Muse to use {pending.appName}?</strong>
  <p>{pending.reason}</p>
  {ownerHint&&<p className="desktop-assist-owner">{ownerHint}</p>}
  <p className="desktop-assist-scope">Muse can inspect and operate this app. Always allow saves permission on this computer; you can revoke it in Settings.</p>
  {expired?<p className="desktop-assist-owner" role="status">Request expired. Muse must ask again.</p>:<div className="desktop-assist-actions">
   <button type="button" className="button compact primary" disabled={disabled} onClick={()=>decide('allow')}>Allow once</button>
   <button type="button" className="button compact" disabled={disabled} onClick={()=>decide('always')}>Always allow</button>
   <button type="button" className="button compact" disabled={assist.busy} onClick={()=>decide('deny')}>Deny</button>
  </div>}
 </div>;
}
function ControlStatus({assist,ownerHint=false}:{assist:Assist;ownerHint?:boolean}){
 const state=assist.state;
 if(!state)return null;
 if(state.stopped)return <div className="desktop-assist-control"><div><strong>Desktop Assist stopped</strong><p>App control stays paused until you resume.</p></div><button type="button" className="button compact" disabled={assist.busy||!state.supported||!state.available||!state.enabled} onClick={()=>void assist.command({type:'resume'})}>Resume Desktop Assist</button></div>;
 if(state.active)return <div className="desktop-assist-control"><div><strong>Controlling {state.active.appName}</strong><p>{ownerHint?'A Muse Code chat is using this app.':'Muse has access to this app for the current chat.'}</p></div><StopButton assist={assist}/></div>;
 return null;
}

export function DesktopAssistBanner({taskId}:{taskId:string}){
 const assist=useDesktopAssist(),state=assist.state;
 const pending=state?.pending?.taskId===taskId,active=state?.active?.taskId===taskId;
 if(!state?.supported||!pending&&!active&&!state.stopped&&!assist.error)return null;
 return <section className="desktop-assist-banner" aria-label="Desktop Assist">
  <div className="desktop-assist-label"><Monitor size={15}/><span>Desktop Assist</span>{pending&&!state.stopped&&!active&&<StopButton assist={assist}/>}</div>
  {pending&&<PermissionCard assist={assist}/>}
  {(active||state.stopped)&&<ControlStatus assist={assist}/>}
  <AssistError error={assist.error}/>
 </section>;
}

export function DesktopAssistSettings({taskId}:{taskId?:string}={}){
 const assist=useDesktopAssist(),state=assist.state;
 const status=!state?'Checking availability…':!state.supported?'Desktop Assist is available in the Windows desktop app.':!state.available?'Desktop Assist is unavailable. Check the desktop helper and try again.':state.stopped?'Stopped until you explicitly resume.':state.enabled?'Ready to request access to individual apps.':'Off. Muse cannot request desktop access.';
 return <section className="settings-section desktop-assist-settings" aria-labelledby="desktop-assist-heading">
  <h3 id="desktop-assist-heading">Desktop Assist</h3>
  <p className="settings-description">Let Muse inspect and operate Windows apps you approve. Each app requires your permission, separate from workspace access.</p>
  <div className="preference-row"><div className="preference-copy"><span>Enable Desktop Assist</span><p>{status}</p></div><div className="preference-control"><button type="button" role="switch" aria-label="Enable Desktop Assist" aria-checked={state?.enabled??false} disabled={!state||assist.busy||!state.enabled&&(!state.supported||!state.available)} className={`preference-toggle ${state?.enabled?'on':''}`} onClick={()=>void assist.command({type:'set',enabled:!state?.enabled})}><span>{state?.enabled&&<Check size={10}/>}</span></button></div></div>
  <AssistError error={assist.error}/>
  <ControlStatus assist={assist} ownerHint/>
  {state?.pending&&<div className="desktop-assist-settings-request"><PermissionCard assist={assist} ownerHint={!taskId?'Requested by a Muse Code chat.':state.pending.taskId!==taskId?'Requested by another chat.':undefined}/>{!state.stopped&&!state.active&&<StopButton assist={assist}/>}</div>}
  <div className="desktop-assist-saved"><h4><ShieldCheck size={15}/>Always allowed apps</h4>
   {state?.allowedApps.length?<ul>{state.allowedApps.map(app=><li key={app.id}><div><strong>{app.name}</strong><span>{app.path}</span></div><button type="button" className="button compact" aria-label={`Revoke ${app.name}`} disabled={assist.busy} onClick={()=>void assist.command({type:'revoke',appId:app.id})}>Revoke</button></li>)}</ul>:<p className="settings-note">No apps are always allowed.</p>}
  </div>
  <p className="settings-note">Only the requested app is accessible. Stop immediately ends current control and blocks further desktop actions until you resume. Muse cannot approve access for itself.</p>
 </section>;
}
