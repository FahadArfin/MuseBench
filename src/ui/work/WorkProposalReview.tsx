import type {WorkProposal} from '../../work/proposals.mjs';
import type {WorkDocument} from '../../shared/work-document-types';
export interface WorkProposalReviewProps {proposal:WorkProposal;onApply:()=>void|Promise<void>;onDiscard:()=>void|Promise<void>;onRegenerate?:()=>void|Promise<void>;onStop?:()=>void|Promise<void>;onPreview?:(document:WorkDocument)=>void;busy?:boolean;}
const show=(value:unknown)=>typeof value==='string'?value:JSON.stringify(value,null,2);
export function WorkProposalReview({proposal,onApply,onDiscard,onRegenerate,onStop,onPreview,busy=false}:WorkProposalReviewProps){
 const waiting=proposal.status==='pending',ready=proposal.status==='ready',conflict=proposal.status==='conflict',finished=['applied','discarded','cancelled'].includes(proposal.status);
 return <article className="studio-proposal" aria-label="Muse edit proposal" aria-busy={waiting||proposal.status==='applying'}>
  <header><strong>{waiting?'Muse is preparing changes':conflict?'Project changed':proposal.status==='failed'?'Proposal unavailable':finished?`Proposal ${proposal.status}`:'Review Muse changes'}</strong><small>Revision {proposal.baseRevision} · {proposal.selection.scope==='selection'?`${proposal.selection.nodeIds.length} selected objects`:proposal.selection.scope==='surface'?'Current page / scene':'Whole project'}</small></header>
  <p role="status">{proposal.summary}</p>
  {proposal.error&&<p role="alert">{proposal.error.message}</p>}
  {waiting&&<p>The saved project stays available while Muse works. A chat reply alone does not change it.</p>}
  {!!proposal.changes.length&&<ol aria-label="Proposed changes">{proposal.changes.map((change,i)=><li key={`${change.targetId}-${i}`}><strong>{change.label}</strong>{change.after!==undefined&&<details><summary>Preview object changes</summary><div className="studio-proposal-comparison"><section><h4>Current</h4><pre style={{whiteSpace:'pre-wrap',maxHeight:220,overflow:'auto'}}>{show(change.before)}</pre></section><section><h4>Proposed</h4><pre style={{whiteSpace:'pre-wrap',maxHeight:220,overflow:'auto'}}>{show(change.after)}</pre></section></div></details>}</li>)}</ol>}
  {proposal.replaced&&<p>This proposal replaces project content. Inspect the complete data before applying.</p>}
  {proposal.previewDocument&&onPreview&&<button className="studio-button" disabled={busy} onClick={()=>onPreview(proposal.previewDocument!)}>Preview in editor</button>}
  {proposal.operations&&<details><summary>Inspect complete proposal</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{JSON.stringify(proposal.operations,null,2)}</pre></details>}
  <div className="studio-proposal-actions">{ready&&<button className="studio-button primary" disabled={busy} onClick={()=>void onApply()}>Apply changes</button>}{waiting&&onStop&&<button className="studio-button" disabled={busy} onClick={()=>void onStop()}>Stop Muse</button>}{!finished&&<button className="studio-button" disabled={busy||proposal.status==='applying'} onClick={()=>void onDiscard()}>Discard</button>}{(conflict||proposal.status==='failed')&&onRegenerate&&<button className="studio-button" disabled={busy} onClick={()=>void onRegenerate()}>Regenerate from current revision</button>}</div>
 </article>;
}
