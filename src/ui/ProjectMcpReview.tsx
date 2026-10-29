import type {CustomizeCommand,ProjectMcpReview as Review} from '../shared/customize-types';
import {RefreshCw} from 'lucide-react';

type Props={data?:Review;busy:boolean;disabled:boolean;accepted:boolean;setAccepted:(value:boolean)=>void;execute:(command:CustomizeCommand)=>Promise<void>};
export function ProjectMcpReview({data,busy,disabled,accepted,setAccepted,execute}:Props){
 return <section className="project-mcp-review" aria-label="Project server review">
  <div className="extensions-toolbar"><div><h3>Project servers</h3><p>Review the tools and project rules Muse will load for this workspace.</p></div><button className="icon-button" aria-label="Refresh project servers" disabled={busy} onClick={()=>void execute({type:'inspectProjectMcp'})}><RefreshCw size={16} className={busy?'spin':''}/></button></div>
  {busy&&!data&&<p role="status">Reading project configuration…</p>}
  {data&&<>
   {data.simulation&&<p className="extensions-help">Preview sample. No files are read, trusted or executed.</p>}
   <p className="extensions-path">Workspace: {data.root}<br/>Trust boundary: {data.boundary}</p>
   {!data.present?<p>No .mcp.json was found in this project. Add your publisher’s configuration to the project, then refresh to review it.</p>:<>
    <p>{data.reviewed?'This configuration matches your saved review. Reconnect Muse after changing access.':'Review these effective server definitions and the project instructions below. Changes require review again.'}</p>
    <div className="project-mcp-servers">{data.servers.map(server=><article key={server.name} className="project-mcp-server">
     <h4>{server.name}<span className="extension-meta"> · {server.enabled?'Enabled':'Disabled'} · {server.required?'Required':'Optional'}</span></h4>
     <pre className="catalog-config">{server.address}{server.args.length?'\n'+JSON.stringify(server.args):''}</pre>
     <p className="extensions-help">{server.transport==='stdio'?`Working folder: ${server.cwd??data.root} · Framing: ${server.framing}`:'Remote MCP endpoint'}<br/>Startup timeout: {server.startupTimeout}s · Tool timeout: {server.toolTimeout}s</p>
     {!!server.environmentKeys.length&&<p>Environment names: {server.environmentKeys.join(', ')} <small>(values hidden)</small></p>}
     {!!server.headerKeys.length&&<p>Header names: {server.headerKeys.join(', ')} <small>(values hidden)</small></p>}
     {server.toolFiltersPresent&&<p className="extensions-alert">This file contains tool filters. Muse 1.4.14 enforcement has not been verified; do not rely on them to restrict access.</p>}
    </article>)}</div>
    {!data.servers.length&&<p>This project configuration declares no servers.</p>}
    <details className="project-mcp-sources"><summary>Configuration sources ({data.sources.length})</summary>{data.sources.map(source=><p className="extensions-path" key={source.path}>{source.path}<br/>{source.bytes.toLocaleString()} bytes · SHA-256 {source.revision}</p>)}</details>
    <details className="project-mcp-sources"><summary>Project instructions included in trust ({data.instructions.length})</summary>{data.instructions.length?data.instructions.map(file=><details key={file.path}><summary>{file.path}</summary><pre className="skill-import-preview">{file.text||'(Empty file)'}</pre></details>):<p>No project instruction files were found within this trust boundary.</p>}</details>
    <p className="extensions-help">Local servers run as your account; remote servers receive data sent to their tools. Configuration review does not prove a server is connected. Secret environment and header values are hidden.</p>
    {data.reviewed?<button className="button" disabled={disabled} onClick={()=>void execute({type:'revokeProjectMcp',root:data.root})}>Revoke project server access</button>:<>
     <label className="extensions-consent"><input type="checkbox" checked={accepted} disabled={disabled} onChange={event=>setAccepted(event.target.checked)}/>I trust these servers and the project instructions in this workspace.</label>
     <button className="button primary" disabled={disabled||!accepted} onClick={()=>void execute({type:'approveProjectMcp',root:data.root,revision:data.revision,reviewed:true})}>{data.simulation?'Simulate project review':'Approve project servers'}</button>
    </>}
   </>}
  </>}
 </section>;
}
