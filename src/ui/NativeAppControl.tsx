import {useEffect,useState} from 'react';
import type {NativeControlState} from '../shared/native-control-types';
export function NativeAppControl(){
 const [state,setState]=useState<NativeControlState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[transport,setTransport]=useState<'http'|'stdio'>('http'),[copied,setCopied]=useState(false);
 async function run(type:'status'|'enable'|'disable',selected=transport){
  setBusy(true);setError('');setCopied(false);
  try{setState(await window.musebench!.nativeControl(type==='status'?{type,transport:selected}:{type}));}
  catch{setError('Could not change app control. Please try again.');try{setState(await window.musebench!.nativeControl({type:'status',transport:selected}));}catch{}}
  finally{setBusy(false);}
 }
 useEffect(()=>{void run('status');},[]);
 const config=transport==='http'?state?.httpConnectionConfig:state?.connectionConfig;
 const configText=config?JSON.stringify({mcpServers:{musebench:config}},null,2):'';
 async function copyConfig(){try{await window.musebench?.copyText?.(configText);setCopied(true);}catch{setError('Could not copy the configuration. Select and copy it from the box.');}}
 return <div><h3>App control</h3><p className="settings-description">Connect Codex or another MCP client to inspect MuseBench, take app screenshots and navigate its interface.</p><div className="mobile-device-status"><div><strong>{state?.running?'Native connection is on':'Native connection is off'}</strong><p>Available only to this desktop account. Keep MuseBench running; UI tools need its window open.</p></div><button className="settings-action" disabled={busy||!state} onClick={()=>void run(state?.enabled?'disable':'enable')}>{state?.enabled?'Turn off':'Turn on'}</button></div>{state?.simulation&&<p className="settings-note">Preview only. Connect from the installed desktop app.</p>}
 {state?.running&&!state.simulation&&<><h4>Connect an MCP client</h4><div role="group" aria-label="MCP connection type" style={{display:'flex',flexWrap:'wrap',gap:8}}>{(['http','stdio'] as const).map(value=><button key={value} className="settings-action" style={transport===value?{borderColor:'var(--accent)'}:undefined} aria-pressed={transport===value} disabled={busy} onClick={()=>{setTransport(value);void run('status',value);}}>{value==='http'?'Shared HTTP (recommended)':'Stdio compatibility'}</button>)}</div>
 <p className="settings-description">{transport==='http'?'Clients connect directly to MuseBench and share one listener, with no relay process per client. Keep MuseBench open. This address and private grant stay valid across app restarts and updates. Turning App control off revokes this configuration.':'Use this for clients that require stdio. Each connected client starts its own relay process; an idle connected relay is expected. On Windows, its separate cached runtime lets MuseBench update while the client stays open.'}</p>
 {config&&<><p className="settings-description">Add this server using your client’s MCP configuration format. Copy it only into the client you want to connect.</p><pre className="settings-path" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{configText}</pre><button className="settings-action" onClick={()=>void copyConfig()}>{copied?'Configuration copied':'Copy MCP configuration'}</button></>}
 {transport==='stdio'&&state.connectionError&&<p role="alert">{state.connectionError} <button className="settings-action" disabled={busy} onClick={()=>void run('status')}>Refresh connection</button></p>}</>}
 {state?.startupError&&<p role="alert">{state.startupError} <button className="settings-action" disabled={busy} onClick={()=>void run('enable')}>Retry connection</button></p>}
 <p className="settings-note">Tools can read local Code chats and visible app content. Sending messages, purchases, approvals and arbitrary commands are not exposed.</p>{error&&<p role="alert">{error}</p>}</div>;
}
