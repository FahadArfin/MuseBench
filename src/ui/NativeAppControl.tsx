import {useEffect,useState} from 'react';
import type {NativeControlState} from '../shared/native-control-types';
export function NativeAppControl(){
 const [state,setState]=useState<NativeControlState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(type:'status'|'enable'|'disable'){setBusy(true);setError('');try{setState(await window.musebench!.nativeControl({type}));}catch{setError('Could not change app control. Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{void run('status');},[]);
 const config=state?.connectionConfig;
 return <div><h3>App control</h3><p className="settings-description">Connect Codex or another MCP client to inspect MuseBench, take app screenshots and navigate its interface.</p><div className="mobile-device-status"><div><strong>{state?.running?'Native connection is on':'Native connection is off'}</strong><p>Available only to this desktop account. Keep MuseBench running; UI tools need its window open.</p></div><button className="settings-action" disabled={busy||!state} onClick={()=>void run(state?.enabled?'disable':'enable')}>{state?.enabled?'Turn off':'Turn on'}</button></div>{state?.simulation&&<p className="settings-note">Preview only. Connect from the installed desktop app.</p>}
 {config&&<><h4>Connect an MCP client</h4><p className="settings-description">Add this server to your client. On Windows, its separate runtime lets MuseBench update while the connection stays open. If you added MuseBench before this update, replace its old configuration once and reconnect your client.</p><pre className="settings-path" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({mcpServers:{musebench:config}},null,2)}</pre><button className="settings-action" onClick={()=>void window.musebench?.copyText?.(JSON.stringify({mcpServers:{musebench:config}},null,2))}>Copy MCP configuration</button></>}
 {state?.connectionError&&<p role="alert">{state.connectionError} <button className="settings-action" disabled={busy} onClick={()=>void run('status')}>Refresh connection</button></p>}
 <p className="settings-note">Tools can read local Code chats and visible app content. Sending messages, purchases, approvals and arbitrary commands are not exposed.</p>{error&&<p role="alert">{error}</p>}</div>;
}
