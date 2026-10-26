const id=v=>typeof v==='string'&&v.trim().length>0;
/** Controller-owned evidence. Never expose recordCheck to model tools/renderer IPC.
 * Hash acquisition and trusted process execution are deliberately outside this boundary.
 */
export class ReviewPackage {
 #state={plan:null,revision:null,previewRevision:null,check:null,runtime:'not-run',acceptedRevision:null};
 #invalidate(){this.#state.previewRevision=null;this.#state.check=null;this.#state.acceptedRevision=null;}
 approvePlan(plan){if(!id(plan))throw Error('Plan identity required');this.#state.plan=plan;this.#invalidate();}
 setRevision(revision){if(!id(revision))throw Error('Revision identity required');if(revision!==this.#state.revision)this.#invalidate();this.#state.revision=revision;}
 setRuntime(status){this.#state.runtime=status;if(status!=='completed')this.#invalidate();}
 inspectPreview(revision){if(!id(revision)||revision!==this.#state.revision)throw Error('Preview revision mismatch');this.#state.previewRevision=revision;}
 recordCheck(result){
  if(!result||result.source!=='runner'||!id(result.command)||!id(result.logId)||typeof result.finished!=='boolean'||!(result.exitCode===null||Number.isInteger(result.exitCode)))throw Error('Trusted runner evidence required');
  if(!id(result.revision)||result.revision!==this.#state.revision)throw Error('Check revision mismatch');
  this.#state.check=structuredClone(result);this.#state.acceptedRevision=null;
 }
 accept(revision){const s=this.#state;if(!id(revision)||!s.plan||revision!==s.revision||s.previewRevision!==revision||s.runtime!=='completed'||s.check?.revision!==revision||s.check.finished!==true||s.check.exitCode!==0)throw Error('Review evidence is missing, stale, or failed');s.acceptedRevision=revision;return this.snapshot();}
 snapshot(){return structuredClone(this.#state);}
}
