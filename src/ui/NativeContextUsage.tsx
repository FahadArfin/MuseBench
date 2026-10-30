import type {Task,RuntimeState} from '../shared/types';
import {restoreContextUsage,contextUsagePresentation} from '../shared/native-context-usage.mjs';

function connected(task:Task,runtime:RuntimeState){
 const saved=restoreContextUsage(task.nativeContextUsage),current=restoreContextUsage(runtime.contextUsage);
 return !!(saved&&current&&task.nativeContextUsage?.connected&&runtime.contextUsage?.connected&&runtime.permissionVerified&&runtime.sessionId===saved.sessionId&&!['unavailable','uncertain','closed'].includes(runtime.status)&&JSON.stringify(saved)===JSON.stringify(current));
}
export function NativeContextButton({task,runtime,onOpen}:{task:Task;runtime:RuntimeState;onOpen:()=>void}){
 const reading=restoreContextUsage(task.nativeContextUsage),live=connected(task,runtime);
 if(!reading&&!task.contextCompactions?.length)return null;
 return <button type="button" className="context-chip" title={reading?'Last native report · Occupancy floor, not billing usage':'Native compaction observations'} onClick={onOpen}>{reading?contextUsagePresentation(reading).label:'Context history'}{reading&&!live&&<small> · Saved</small>}</button>;
}
export function NativeContextUsage({task,runtime}:{task:Task;runtime:RuntimeState}){
 const reading=restoreContextUsage(task.nativeContextUsage),live=connected(task,runtime),view=contextUsagePresentation(reading);
 return <section className="native-context-usage" aria-label="Native context usage"><h3>Context usage</h3>{!reading?<p>No native context reading reported for this chat.</p>:<>
  <div className="native-context-summary"><strong>{reading.usedTokens.toLocaleString()}{reading.windowTokens!==null?` / ${reading.windowTokens.toLocaleString()}`:''} tokens</strong><small>{live?'Connected':'Saved reading'} · {reading.source==='restored'?'Restored snapshot':'Native event'}</small></div>
  {view.meter!==null?<div className="native-context-meter" role="progressbar" aria-label="Reported context occupancy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.meter} aria-valuetext={`At least ${view.percentage}% of the reported window`}><span style={{width:`${view.meter}%`}}/></div>:<p className="popover-help">Context window not reported.</p>}
  <p className="popover-help">Native pressure: {{normal:'Normal',warning:'Warning',blocked:'Blocked',unknown:'Not reported'}[reading.pressure]} · Observed <time dateTime={reading.observedAt}>{new Date(reading.observedAt).toLocaleString()}</time></p>
  <p className="popover-help">Last reported occupancy floor{view.percentage!==null?` · at least ${view.percentage.toLocaleString()}%`:''}. Context may have changed since this reading. This is separate from billing and does not identify which messages Muse retained.</p>
  {runtime.simulation&&<p className="popover-help">Preview sample · No model requests.</p>}
  <details><summary>Reading details</summary><dl><dt>Session</dt><dd>{reading.sessionId}</dd><dt>Native cursor</dt><dd>{reading.viewCursor||'Snapshot start'}</dd></dl></details>
 </>}</section>;
}
