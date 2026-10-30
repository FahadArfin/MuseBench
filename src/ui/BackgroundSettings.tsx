import {useEffect,useState} from 'react';
import {Check} from 'lucide-react';
import type {MuseBenchBridge} from '../shared/types';
type State=Awaited<ReturnType<MuseBenchBridge['backgroundEngine']>>;
export function BackgroundSettings(){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void window.musebench?.backgroundEngine({type:'status'}).then(value=>{if(active)setState(value);}).catch(()=>{if(active)setError('Could not read the background setting. Reopen Settings to try again.');});return()=>{active=false;};},[]);
 async function change(){if(!state||busy)return;setBusy(true);setError('');try{setState(await window.musebench!.backgroundEngine({type:'set',enabled:!state.enabled}));}catch{setError('Could not save background mode. Check that the system tray is available and try again.');}finally{setBusy(false);}}
 return <section className="settings-section"><h3>Background activity</h3><div className="preference-row"><div className="preference-copy"><span>Keep running when the window closes</span><p>Keep Code work and paired mobile access available. Use the tray icon to reopen or quit MuseBench.</p></div><div className="preference-control"><button type="button" role="switch" aria-label="Keep running when the window closes" aria-checked={state?.enabled??false} disabled={!state||busy} className={`preference-toggle ${state?.enabled?'on':''}`} onClick={()=>void change()}><span>{state?.enabled&&<Check size={10}/>}</span></button></div></div>{state?.simulation&&<p className="settings-note">Preview only. Background activity runs in the installed desktop app.</p>}{error&&<p role="alert">{error}</p>}</section>;
}
