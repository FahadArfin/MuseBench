import {rename} from 'node:fs/promises';
/** Windows scanners and sync clients briefly hold a replaced metadata file open. */
export async function renameWorkFile(from,to,{renameFile=rename,attempts=8}={}){
 for(let attempt=0;;attempt++){try{return await renameFile(from,to);}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=attempts-1)throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(8*2**attempt,200)));}}
}
