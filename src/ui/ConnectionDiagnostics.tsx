import {useState} from 'react';
import {Copy} from 'lucide-react';
import type {RuntimeState} from '../shared/types';
import type {CustomizeState} from '../shared/customize-types';
import {connectionDiagnostics,extensionDiagnostics,diagnosticReport,type DiagnosticRow} from '../shared/connection-diagnostics.mjs';
import './connection-diagnostics.css';

function Rows({items}:{items:DiagnosticRow[]}){
 return <dl>{items.map(item=><div key={item.id}><dt>{item.label}<span>{item.value}</span></dt><dd>{item.detail}</dd></div>)}</dl>;
}
export function ConnectionDiagnostics({runtime}:{runtime:RuntimeState}){
 const [notice,setNotice]=useState(''),[copying,setCopying]=useState(false);
 const copy=async()=>{if(copying)return;setCopying(true);setNotice('');try{const text=diagnosticReport(runtime);if(window.musebench?.copyText)await window.musebench.copyText(text);else await navigator.clipboard.writeText(text);setNotice('Diagnostic summary copied.');}catch{setNotice('Could not copy. Try again.');}finally{setCopying(false);}};
 return <details className="connection-diagnostics"><summary>Connection diagnostics</summary><Rows items={connectionDiagnostics(runtime)}/><button type="button" className="button compact" disabled={copying} onClick={()=>void copy()}><Copy size={14}/>Copy diagnostic summary</button>{notice&&<p role="status">{notice}</p>}</details>;
}
export function ExtensionDiagnostics({state,onConnection}:{state:CustomizeState;onConnection:()=>void}){
 return <details className="connection-diagnostics extension-diagnostics"><summary>Setup status</summary><Rows items={extensionDiagnostics(state)}/><button type="button" className="button compact" onClick={onConnection}>Muse connection</button></details>;
}
