import {updateSurfaceBlockers} from './app-updates.mjs';

/** Passive UI observations use small service-owned status projections only.
 * Installation separately rechecks the authoritative shutdown guard. */
export function readUpdateBlockers({controller,work,sites,dictation,operations}){
 const rows=controller.getUpdateBlockers(),workState=work.getUpdateState(),siteState=sites.getUpdateState();
 rows.push(...updateSurfaceBlockers('work','Work',workState),...updateSurfaceBlockers('sites','Sites',siteState),...updateSurfaceBlockers('site-generation','Sites generation',{...siteState.generation,item:siteState.site}),...updateSurfaceBlockers('dictation','Dictation',dictation.snapshot()));
 for(const [id,label,busy] of operations())if(busy)rows.push({id,label,detail:'An operation is still in progress.'});
 return rows;
}
