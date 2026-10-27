import {SemanticNavigation} from './SemanticNavigation';
import {useState} from 'react';
import {workspaceTools} from '../shared/workspace-tools.mjs';
export function WorkspaceTools({projectId,taskId,navigate}:{projectId?:string;taskId?:string;navigate:(command:string)=>void}){
 const [semantic,setSemantic]=useState(false);
 const [query,setQuery]=useState('');const tools=workspaceTools({project:!!projectId,task:!!taskId}).filter(t=>(t.title+' '+t.description+' '+t.input+' '+t.output).toLowerCase().includes(query.toLowerCase()));
 if(semantic&&projectId)return <><button className="text-link" onClick={()=>setSemantic(false)}>Back to workspace tools</button><SemanticNavigation projectId={projectId} taskId={taskId}/></>;
 return <section aria-label="Workspace tools"><p>Find app controls and inspect their inputs before opening them. Permissions and source freshness are checked when an action runs.</p><input aria-label="Search workspace tools" placeholder="Search tools, diagnostics, history…" value={query} onChange={e=>setQuery(e.target.value)}/>{tools.map(tool=><article className="context-receipt" key={tool.id}><strong>{tool.title}</strong><p>{tool.description}</p><small>{tool.reason}</small><details><summary>Input and result contract</summary><dl><dt>Input</dt><dd>{tool.input}</dd><dt>Result and limits</dt><dd>{tool.output}</dd></dl></details>{tool.command&&<button className="button" disabled={!tool.available} onClick={()=>tool.id==='semantic'?setSemantic(true):navigate(tool.command!)}>Open {tool.title}</button>}</article>)}{!tools.length&&<p>No matching tools.</p>}</section>;
}
