import {access,stat} from 'node:fs/promises';import {constants} from 'node:fs';import {delimiter,join} from 'node:path';
// Discovery only: never executes candidates or inspects auth/configuration.
const candidates=[];
for(const folder of (process.env.PATH??'').split(delimiter).filter(Boolean)){
 const path=join(folder,process.platform==='win32'?'muse.exe':'muse');
 try{await access(path,constants.X_OK);if((await stat(path)).isFile()&&!candidates.includes(path))candidates.push(path);}catch{}
}
console.log(JSON.stringify({runtime:candidates.length?'candidate-found-not-executed':'unavailable',candidates,liveVerified:false,action:'No binary executed; no credentials read.',next:candidates.length?'Verify the candidate is your trusted official Muse installation before any manual version/schema check.':'The offline adapter demo and tests work without Muse. Live integration remains unavailable.'},null,2));
