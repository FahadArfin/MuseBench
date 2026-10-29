import {RefreshCw} from 'lucide-react';
import type {CustomizeCommand,PluginMcpReview} from '../shared/customize-types';
const observation='Observation only: output can report status, but cannot change context or control the session.';
const hookEffects:Record<string,string>={
 SessionStart:'Can add chat context or stop the turn.',
 UserPromptSubmit:'Can add chat context or reject your prompt.',
 PreToolUse:'Can replace tool inputs, deny a tool, or require approval. Changed inputs still follow the tool’s approval rules.',
 PermissionRequest:'This hook can also approve or deny tool requests.',
 PostToolUse:'Can add context or feedback, or stop the turn. Completed tools have already run.',
 PostToolUseFailure:'Can add context or feedback, or stop the turn. It does not undo the failed tool.',
 PostToolBatch:'Can add context or feedback, or stop the turn. Completed tools have already run.',
 PreLLMCall:'Can add model context or block this model step.',
 PostLLMCall:'Can add model context or block this model step.',
 PreCompact:'Can cancel compaction before it starts.',PostCompact:observation,
 SubagentStart:'Can add context to the sub-agent.',
 Stop:'Can prevent the turn from finishing and ask the model to keep working, which may use more of your allowance.',
 SubagentStop:'Can keep the sub-agent working instead of finishing, which may use more of your allowance.',
 StopFailure:observation,SessionEnd:observation,Notification:observation,SessionFork:observation,ToolUseStart:observation,
};
export function PluginTools({value,disabled,inspect,ask}:{value?:PluginMcpReview;disabled:boolean;inspect:()=>void;ask:(title:string,description:string,command:CustomizeCommand,reviewCode?:string)=>void}){
 const commandText=(server:PluginMcpReview['servers'][number])=>server.hook?.execution==='shell'?server.command?.[0]:JSON.stringify(server.command);
 const behavior=(server:PluginMcpReview['servers'][number])=>server.hook?`Runs automatically on ${server.hook.event}${server.hook.compatibilityName?` for ${server.hook.compatibilityName}`:''}, with a ${server.hook.timeoutMs/1000} s limit. ${server.hook.execution==='shell'?`Runs as a shell command from ${server.hook.source}. ${server.hook.matcher?`Uses the event matcher ${server.hook.matcher}. `:'Matches all events of this type. '}${server.hook.ignoredSilent?'The imported silent setting is ignored by Muse. ':''}`:''}${server.hook.async?'Runs in the background; output does not change the session.':`Waits for completion. ${hookEffects[server.hook.event]??'Review this event in the official Muse CLI before approving.'}`} `:'';
 return <section className="plugin-tools" aria-label="Tools & hooks">
  <header><h4>Tools &amp; hooks</h4><button className="icon-button" aria-label="Refresh plugin tools" disabled={disabled} onClick={inspect}><RefreshCw size={14}/></button></header>
  {!value?<p className="extension-meta">Open the tool details to review access.</p>:<>
   {value.simulation&&<p className="extension-meta">Simulated tools and hooks · no program runs in preview.</p>}
   {!value.servers.length&&<p className="extension-meta">This plugin has no executable tools or hooks to approve.</p>}
   {!value.inventoryReviewed&&<p className="extension-meta">Review the installed plugin above before approving access.</p>}
   {value.servers.map(server=><article className="plugin-tool" key={server.stableId}>
    <div className="plugin-tool-heading"><strong>{server.title}</strong><span className="extension-meta">{!server.supported?'Setup required':server.reviewed?'Approved':server.status==='trusted_disabled'?'Revoked':'Needs review'}</span></div>
    {server.hook&&<p className="extension-meta">{server.hook.event} · {server.hook.timeoutMs/1000} s limit · {server.hook.async?'Background · output ignored':'Waits for completion'}{server.hook.compatibilityName&&` · Matches ${server.hook.compatibilityName}`}</p>}
    {server.hook?.execution==='shell'&&<p className="extension-meta">Shell command · {server.hook.source} · {server.hook.matcher?`Matches ${server.hook.matcher}`:'Matches all'}{server.hook.ignoredSilent&&' · Imported silent setting ignored'}</p>}
    {server.command&&<code>{commandText(server)}</code>}
    {server.reason&&<p className="extension-meta">{server.reason}</p>}
    {server.supported&&<div className="extension-controls">
     {!server.reviewed&&<button className="button" aria-label={`Review access for ${server.title}`} disabled={disabled||!value.enabled||!value.inventoryReviewed} onClick={()=>ask(`Approve ${server.title}`,`${behavior(server)}This program runs under your account and can access files available to you. Approve this exact plugin ${server.hook?'hook':'tool'} for new Muse connections.${server.hook?.execution==='shell'?'':' Recognized credential fields are hidden.'}`,{type:'pluginMcpAction',id:value.id,stableId:server.stableId,revision:value.revision,action:'approve',reviewed:true},commandText(server))}>Review access</button>}
     {server.enabled&&<button className="button" aria-label={`Revoke access for ${server.title}`} disabled={disabled} onClick={()=>ask(`Revoke ${server.title}`,`Remove approval for this plugin ${server.hook?'hook':'tool'}. Reconnect Muse to stop using its previous configuration.`,{type:'pluginMcpAction',id:value.id,stableId:server.stableId,revision:value.revision,action:'reject',reviewed:true})}>Revoke access</button>}
    </div>}
   </article>)}
  </>}
 </section>;
}
