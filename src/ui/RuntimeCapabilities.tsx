import type {RuntimeState} from '../shared/types';
import {runtimeCapabilities} from '../shared/runtime-capabilities.mjs';
import './runtime-capabilities.css';
export function RuntimeCapabilities({runtime}:{runtime:RuntimeState}){
 return <details className="runtime-capabilities"><summary>Connection capabilities</summary><dl>{runtimeCapabilities(runtime).map(item=><div key={item.id}><dt>{item.label}<span data-status={item.status}>{({available:'Available',disconnected:'Connect first',unavailable:'Unavailable',simulated:'Preview'})[item.status]}</span></dt><dd>{item.reason}</dd></div>)}</dl></details>;
}
