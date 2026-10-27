/** Adapter capabilities, not promises inferred from provider/model prose. */
export function runtimeCapabilities(runtime={}) {
 const exec=runtime.transport==='exec',msp=runtime.transport==='msp';
 const ready=runtime.permissionVerified===true&&!['unavailable','closed','uncertain','error','connecting','checking-permissions'].includes(runtime.status);
 const row=(id,label,supported,reason)=>({id,label,status:runtime.simulation?'simulated':!supported?'unavailable':ready?'available':'disconnected',reason:runtime.simulation?'Preview sample only; no native operation is executed.':!supported?reason:ready?'Supported by the current adapter.':'Connect and verify permissions to use this feature.'});
 return [
  row('sessions','Saved native sessions',exec&&runtime.durableSessions===true,'This connection does not restore saved native Code sessions.'),
  row('images','Screenshot input',exec,'Screenshot transport requires the native exec connection.'),
  row('shell','Agent shell commands',exec&&runtime.shellEnabled===true||msp,runtime.shellUnavailableReason||'Shell commands are unavailable for this connection.'),
  row('approvals','Interactive approvals',msp,'Exec stops when human approval is required. It cannot submit an approval response.'),
  row('steering','Live steering',msp&&runtime.steeringSupported===true,'Requires a validated interactive connection with exact-turn steering support.'),
  row('questions','Answer agent questions',false,'Interactive user-input requests are not supported by this adapter.'),
  row('childControls','Child agent controls',msp&&runtime.childControlsSupported===true,'Activity can be displayed; child messaging and cancellation are not connected.'),
  row('compaction','Native context compaction',msp&&runtime.compactionSupported===true,'Local context trimming does not compact the native session.'),
  row('modelSelection','Model selection',exec,'This connection uses the Muse provider default model.'),
  row('web','Native web tools',false,'Native web_fetch stalled in headless validation; web tools remain disabled.'),
  row('hooks','Reviewed project hooks',exec,'Reviewed app-owned hooks require the native exec connection.'),
 ];
}
