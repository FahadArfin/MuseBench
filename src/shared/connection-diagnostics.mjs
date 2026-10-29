// Read-only observations, never a connection/authentication/health probe.
const connectedStatuses=new Set(['idle','ready','connected','running','completed','failed','cancelled','waiting','awaiting-input','awaiting-approval']);
const row=(id,label,value,detail)=>({id,label,value,detail});
export function connectionDiagnostics(runtime={}){
 const simulated=runtime.simulation===true;
 const pending=runtime.pending?.kind??runtime.pendingRequests?.[0]?.kind;
 const waiting=runtime.status==='blocked'&&['input','approval'].includes(pending);
 const verified=runtime.permissionVerified===true&&(connectedStatuses.has(runtime.status)||waiting)&&runtime.cleanup!=='unconfirmed';
 const connection=simulated?'Preview simulation':runtime.status==='uncertain'?'Outcome uncertain':runtime.cleanup==='unconfirmed'?'Cleanup unconfirmed':['connecting','checking-permissions','starting'].includes(runtime.status)?'Connecting':verified?waiting?pending==='input'?'Needs your answer':'Needs approval':'Connected':['closed','unavailable'].includes(runtime.status)?'Disconnected':runtime.status==='error'?'Needs attention':'Not confirmed';
 const rows=[
  row('runtime','Local Muse',simulated?'Preview only':runtime.binary?'Executable selected':'No executable selected',simulated?'No native process is started.':runtime.binary?'Connect to verify this installation.':'Choose your installed Muse executable in the connection controls.'),
  row('connection','Connection',connection,simulated?'Controls use sample data.':verified?'Observed native connection; this does not verify provider availability.':runtime.status==='uncertain'?'Inspect the last response and project changes before sending again.':'Use the connection controls below; saved chats remain available.'),
  row('permissions','Permissions',simulated?'Simulated':verified?'Verified for this connection':'Not confirmed',simulated?'No native permissions were granted.':verified?'Your selected approval and execution-access settings still apply.':'A discovered executable or previous successful request is not a current permission check.'),
  row('completion','Model request',!simulated&&runtime.liveVerified===true?'Previously observed':'Not tested','A prior completed request does not confirm present sign-in, billing or tool availability.'),
 ];
 if(pending)rows.push(row('input','Waiting for you',pending==='input'?'Question':pending==='approval'?'Approval':'Pending request',pending==='input'?'Answer the current question in this chat.':pending==='approval'?'Review the current approval in this chat.':'Inspect this chat before continuing.'));
 if(runtime.cleanup==='unconfirmed')rows.push(row('cleanup','Process cleanup','Unconfirmed','Inspect running work before reconnecting. An unknown outcome is never retried automatically.'));
 if(runtime.restoration?.status==='restored')rows.push(row('history','Conversation context','Native session restored','The runtime reported restoration; local chat history and provider context are separate.'));
 else if(runtime.restoration)rows.push(row('history','Conversation context','Restoration not confirmed','Inspect Session details and resolve recovery before relying on native context.'));
 return rows;
}
export function extensionDiagnostics(state={}){
 const plugins=state.plugins??[],servers=state.servers??[],skills=state.skills??[];
 const attention=plugins.filter(p=>!p.valid||p.enabled&&(p.reviewRequired||state.pluginsReviewed===false)).length;
 const enabled=servers.filter(s=>s.enabled),review=enabled.filter(s=>!s.reviewed).length;
 const incomplete=!state.available||!!state.errors?.length;
 return [
  row('inventory','Inventory',incomplete?'Incomplete snapshot':state.simulation?'Preview sample':'Configuration read',incomplete?'Refresh or open Muse connection settings. Missing rows do not establish that nothing is installed.':'This is saved configuration, not a live tool health check.'),
  row('plugins','Plugins',`${plugins.length} installed · ${attention} need attention`,'Open an installed plugin to review invalid or unapproved capabilities. Disabled plugins do not run.'),
  row('servers','MCP servers',`${enabled.length} enabled · ${review} ${review===1?'needs':'need'} review · ${servers.length-enabled.length} disabled`,'Open an installed server to review access or sign in. Sign-in and tool availability are not checked here.'),
  row('skills','Skills',state.skillCatalog?.stale?'Last saved inventory':`${skills.length} listed`,state.skillCatalog?.stale?'Refresh to read current skill settings.':'Listed skills may be disabled, manual-only or scoped to a project; inspect their settings.'),
 ];
}
const version=value=>typeof value==='string'&&/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,32})?$/.test(value)?value:'Not reported';
export function diagnosticReport(runtime={}){
 return ['MuseBench connection report',`Transport: ${runtime.transport==='msp'?'Interactive':runtime.transport==='exec'?'Native exec':'Not reported'}`,`SDK: ${version(runtime.sdkVersion)}`,`Runtime version: ${version(runtime.hostVersion)}`,...connectionDiagnostics(runtime).map(item=>`${item.label}: ${item.value} — ${item.detail}`),'No provider, sign-in or billing probe was performed. Paths, IDs, account data and raw errors are excluded.'].join('\n');
}
