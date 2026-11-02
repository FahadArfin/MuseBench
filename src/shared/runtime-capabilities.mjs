/** Adapter capabilities, not promises inferred from provider/model prose. */
export function runtimeCapabilities(runtime={}) {
 const exec=runtime.transport==='exec',msp=runtime.transport==='msp';
 const planning=runtime.planning===true;
 const ready=runtime.permissionVerified===true&&!['unavailable','closed','uncertain','error','connecting','checking-permissions'].includes(runtime.status);
 const row=(id,label,supported,reason)=>({id,label,status:runtime.simulation?'simulated':!supported?'unavailable':ready?'available':'disconnected',reason:runtime.simulation?'Preview sample only; no native operation is executed.':!supported?reason:ready?'Supported by the current adapter.':'Connect and verify permissions to use this feature.'});
 return [
  row('sessions','Saved native sessions',(exec||msp)&&runtime.durableSessions===true,'This connection does not restore saved native Code sessions.'),
  row('images','Screenshot input',exec||msp&&runtime.imagesSupported===true,'Screenshot transport is unavailable for this connection.'),
  row('shell','Agent shell commands',!planning&&(exec&&runtime.shellEnabled===true||msp),planning?'Read-only planning disables shell execution.':runtime.shellUnavailableReason||'Shell commands are unavailable for this connection.'),
  row('approvals','Interactive approvals',msp,'Exec stops when human approval is required. It cannot submit an approval response.'),
  row('steering','Live steering',msp&&runtime.steeringSupported===true,'Requires a validated interactive connection with exact-turn steering support.'),
  row('questions','Answer agent questions',msp&&runtime.questionsSupported===true,'Interactive user-input requests are not supported by this adapter.'),
  row('childControls','Child agent controls',msp&&runtime.childControlsSupported===true,'Activity can be displayed; child messaging and cancellation are not connected.'),
  row('compaction','Native context compaction',msp&&runtime.compactionSupported===true,'Local context trimming does not compact the native session.'),
  row('modelSelection','Model selection',exec||msp&&runtime.modelsSupported===true,'This connection uses the Muse provider default model.'),
  row('web','Native web search',!planning&&runtime.webSearchEnabled===true,'Native web search is not enabled for this connection.'),
  row('webFetch','Read web pages',!planning&&(runtime.publicWebEnabled===true||exec&&runtime.webFetchEnabled===true),'Public webpage reading is unavailable for this connection. Native web search can still provide source links.'),
  row('hooks','Reviewed project hooks',!planning&&(exec||msp&&runtime.hooksSupported===true),'Reviewed app-owned hooks are unavailable for this connection.'),
  row('workspaceTools','Semantic workspace tools',msp&&runtime.workspaceTools===true,'Enable semantic workspace tools when connecting interactively.'),
 ];
}
