import {useState} from 'react';
import {workspaceOperations,type WorkspaceToolset} from '../shared/workspace-analysis.mjs';

export function WorkspaceToolOptions({enabled,toolset,onEnabled,onToolset}:{enabled:boolean;toolset:WorkspaceToolset;onEnabled:(value:boolean)=>void;onToolset:(value:WorkspaceToolset)=>void}){
 const [query,setQuery]=useState('');
 const operations=workspaceOperations(toolset,query);
 return <><div className="workspace-tool-selection"><label><input type="checkbox" checked={enabled} onChange={e=>onEnabled(e.target.checked)}/>Semantic code navigation</label>{enabled&&<select aria-label="Workspace tool set" value={toolset} onChange={e=>onToolset(e.target.value as WorkspaceToolset)}><option value="navigation-v1">Navigation</option><option value="analysis-v1">Analysis + batches</option></select>}</div><p>{toolset==='analysis-v1'?'Seven read-only source tools, including symbols and syntax checks. Up to eight calls share one bounded snapshot.':'Definitions, references, implementations and types in this workspace.'} TypeScript and JavaScript.</p><details className="workspace-operation-discovery"><summary>Explore workspace operations</summary><input type="search" aria-label="Search workspace operations" placeholder="Find an operation…" maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/><ul>{operations.map(operation=><li key={operation.name}><strong>{operation.name.replaceAll('_',' ')}</strong><span>{operation.description}</span></li>)}</ul>{!operations.length&&<p>No matching operations.</p>}</details></>;
}
