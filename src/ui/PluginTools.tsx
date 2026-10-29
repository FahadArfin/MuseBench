import {RefreshCw} from 'lucide-react';
import type {CustomizeCommand,PluginMcpReview} from '../shared/customize-types';
export function PluginTools({value,disabled,inspect,ask}:{value?:PluginMcpReview;disabled:boolean;inspect:()=>void;ask:(title:string,description:string,command:CustomizeCommand)=>void}){
 return <section className="plugin-tools" aria-label="Plugin tools">
  <header><h4>Plugin tools</h4><button className="icon-button" aria-label="Refresh plugin tools" disabled={disabled} onClick={inspect}><RefreshCw size={14}/></button></header>
  {!value?<p className="extension-meta">Open the tool details to review access.</p>:<>
   {value.simulation&&<p className="extension-meta">Simulated tools · no program runs in preview.</p>}
   {!value.servers.length&&<p className="extension-meta">This plugin has no executable tools to approve.</p>}
   {!value.inventoryReviewed&&<p className="extension-meta">Review the installed plugin above before approving its tools.</p>}
   {value.servers.map(server=><article className="plugin-tool" key={server.stableId}>
    <div className="plugin-tool-heading"><strong>{server.title}</strong><span className="extension-meta">{!server.supported?'Setup required':server.reviewed?'Approved':server.status==='trusted_disabled'?'Revoked':'Needs review'}</span></div>
    {server.command&&<code>{JSON.stringify(server.command)}</code>}
    {server.reason&&<p className="extension-meta">{server.reason}</p>}
    {server.supported&&<div className="extension-controls">
     {!server.reviewed&&<button className="button" aria-label={`Review access for ${server.title}`} disabled={disabled||!value.enabled||!value.inventoryReviewed} onClick={()=>ask(`Approve ${server.title}`,`${JSON.stringify(server.command)}\nThis program runs under your account and can access files available to you. Approve this exact plugin tool for new Muse connections. Credentials, if present, are hidden.`,{type:'pluginMcpAction',id:value.id,stableId:server.stableId,revision:value.revision,action:'approve',reviewed:true})}>Review access</button>}
     {server.enabled&&<button className="button" aria-label={`Revoke access for ${server.title}`} disabled={disabled} onClick={()=>ask(`Revoke ${server.title}`,'Remove approval for this plugin tool. Reconnect Muse to stop using its previous configuration.',{type:'pluginMcpAction',id:value.id,stableId:server.stableId,revision:value.revision,action:'reject',reviewed:true})}>Revoke access</button>}
    </div>}
   </article>)}
  </>}
 </section>;
}
