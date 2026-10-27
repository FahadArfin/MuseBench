import {createContext,useContext,useEffect,useState} from 'react';
import {ArrowUpCircle,Download,LoaderCircle,RefreshCw} from 'lucide-react';
import type {AppUpdateCommand,AppUpdateState} from '../shared/types';
import './app-updates.css';
const initial:AppUpdateState={version:'',status:'idle',availableVersion:null,percent:0,lastChecked:null,error:null};
export function useAppUpdates(){
 const [state,setState]=useState(initial);
 useEffect(()=>{let live=true,observed=false;const bridge=window.musebench;if(!bridge?.appUpdate)return;const off=bridge.onAppUpdate(value=>{observed=true;if(live)setState(value);});void bridge.appUpdate('status').then(value=>{if(live&&!observed)setState(value);}).catch(()=>{});return()=>{live=false;off();};},[]);
 async function command(value:AppUpdateCommand){try{const result=await window.musebench?.appUpdate(value);if(result)setState(result);}catch(error){setState(s=>({...s,error:error instanceof Error?error.message:'Update action failed.'}));}}
 return{state,command};
}
export const AppUpdatesContext=createContext<{state:AppUpdateState;command:(command:AppUpdateCommand)=>Promise<void>;open:()=>void}>({state:initial,command:async()=>{},open:()=>{}});
export function UpdateToolbar(){
 const {state,command,open}=useContext(AppUpdatesContext);
 if(!['available','downloading','downloaded','installing'].includes(state.status))return null;
 const label=state.status==='available'?'Download update':state.status==='downloaded'?'Restart to update':state.status==='installing'?'Installing update':`Downloading update: ${state.percent}%`;
 return <button className="icon-button app-update-indicator" title={label} aria-label={state.status==='downloaded'?'Review downloaded update':label} onClick={()=>{open();if(state.status==='available')void command('download');}}>{['downloading','installing'].includes(state.status)?<LoaderCircle size={17} className="spin"/>:<ArrowUpCircle size={18}/>}</button>;
}
export function AppUpdatePanel(){
 const {state,command}=useContext(AppUpdatesContext),working=['checking','downloading','installing','restart-required'].includes(state.status);
 const status={idle:'Check for a new version.',unsupported:'Install MuseBench with the Windows setup to enable updates.',checking:'Checking for updates…',current:'You’re up to date.',available:`MuseBench ${state.availableVersion} is available.`,downloading:`Downloading… ${state.percent}%`,downloaded:'Ready to restart.',installing:'Restarting to update…','restart-required':'Close and reopen MuseBench to continue.',error:'Update check failed.'}[state.status];
 return <section className="app-update-panel" aria-label="App updates"><h3>App updates</h3><p className="settings-description">MuseBench {state.version||'—'}</p><p role="status">{status}</p>{state.simulation&&<p className="settings-note">Preview simulation · No installer is downloaded or run.</p>}{state.status==='downloading'&&<progress aria-label="Update download progress" max="100" value={state.percent}/>}<div className="settings-actions">
 {state.status!=='downloaded'&&<button className="settings-action" disabled={working||state.status==='unsupported'} onClick={()=>void command('check')}><RefreshCw size={14}/>Check for updates</button>}
 {state.status==='available'&&<button className="primary-button" onClick={()=>void command('download')}><Download size={14}/>Download update</button>}
 {state.status==='downloaded'&&<button className="primary-button" onClick={()=>void command('install')}><RefreshCw size={14}/>Restart to update</button>}
 </div>{state.error&&<p role="alert" className="settings-feedback">{state.error}</p>}<p className="settings-note">Checks automatically every 30 minutes while MuseBench is open. Installation waits until active work has finished.</p>{state.lastChecked&&<p className="settings-note">Last checked: {new Date(state.lastChecked).toLocaleTimeString()}</p>}</section>;
}
