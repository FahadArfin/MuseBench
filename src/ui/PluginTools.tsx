import {RefreshCw} from 'lucide-react';
import type {CustomizeCommand,PluginMcpReview} from '../shared/customize-types';
export function PluginTools({value,disabled,inspect,ask}:{value?:PluginMcpReview;disabled:boolean;inspect:()=>void;ask:(title:string,description:string,command:CustomizeCommand)=>void}){
 const behavior=(server:PluginMcpReview['servers'][number])=>server.hook?`Runs automatically on ${server.hook.event}${server.hook.compatibilityName?` for ${server.hook.compatibilityName}`:''}, with a ${server.hook.timeoutMs/1000} s limit. ${server.hook.async?'Runs in the background; output does not change the session.':`Waits for completion; output may change chat context or block work.${server.hook.event==='PermissionRequest'?' This hook can also approve or deny tool requests.':''}`} `:'';
 return <section className="plugin-tools" aria-label="Tools & hooks">
  <header><h4>Tools &amp; hooks</h4><button className="icon-button" aria-label="Refresh plugin tools" disabled={disabled} onClick={inspect}><RefreshCw size={14}/></button></header>
  {!value?<p className="extension-meta">Open the tool details to review access.</p>:<>
   {value.simulation&&<p className="extension-meta">Simulated tools and hooks · no program runs in preview.</p>}
   {!value.servers.length&&<p className="extension-meta">This plugin has no executable tools or hooks to approve.</p>}
   {!value.inventoryReviewed&&<p className="extension-meta">Review the installed plugin above before approving access.</p>}
   {value.servers.map(server=><article className="plugin-tool" key={server.stableId}>
    <div className="plugin-tool-heading"><strong>{server.title}</strong><span className="extension-meta">{!server.supported?'Setup required':server.reviewed?'Approved':server.status==='trusted_disabled'?'Revoked':'Needs review'}</span></div>
    {server.hook&&<p className="extension-meta">{server.hook.event} · {server.hook.timeoutMs/1000} s limit · {server.hook.async?'Background · output ignored':'Waits for completion'}{server.hook.compatibilityName&&` · Matches ${server.hook.compatibilityName}`}</p>}
    {server.command&&<code>{JSON.stringify(server.command)}</code>}
    {server.reason&&<p className="extension-meta">{server.reason}</p>}
    {server.supported&&<div className="extension-controls">
     {!server.reviewed&&<button className="button" aria-label={`Review access for ${server.title}`} disabled={disabled||!value.enabled||!value.inventoryReviewed} onClick={()=>ask(`Approve ${server.title}`,`${JSON.stringify(server.command)}\n${behavior(server)}This program runs under your account and can access files available to you. Approve this exact plugin ${server.hook?'hook':'tool'} for new Muse connections. Recognized credential fields are hidden.`,{type:'pluginMcpAction',id:value.id,stableId:server.stableId,revision:value.revision,action:'approve',reviewed:true})}>Review access</button>}
     {server.enabled&&<button className="button" aria-label={`Revoke access for ${server.title}`} disabled={disabled} onClick={()=>ask(`Revoke ${server.title}`,`Remove approval for this plugin ${server.hook?'hook':'tool'}. Reconnect Muse to stop using its previous configuration.`,{type:'pluginMcpAction',id:value.id,stableId:server.stableId,revision:value.revision,action:'reject',reviewed:true})}>Revoke access</button>}
    </div>}
   </article>)}
  </>}
 </section>;
}
