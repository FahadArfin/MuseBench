import {readFileSync} from 'node:fs';
import {TARGET} from '../compatibility.mjs';
// Synthetic connection seam: never a replacement for the actual SDK or host.
export const descriptor=()=>({sdkVersion:TARGET.sdkVersion,initializeResult:{serverInfo:{name:'muse-session-server',version:TARGET.hostVersion},schema:{version:TARGET.schemaVersion,fingerprint:TARGET.fingerprint},sandboxAvailability:'available'}});
export const rows=readFileSync(new URL('../evidence/transcript.ndjson',import.meta.url),'utf8').trim().split('\n').map(s=>{const row=JSON.parse(s);return {dir:row.dir,frame:JSON.parse(row.raw)};});
export const sessionResult=rows.find(r=>r.frame.id===2&&r.frame.result)?.frame.result;
export const turnAck=rows.find(r=>r.frame.id===3&&r.frame.result)?.frame.result;
export const events=rows.filter(r=>r.dir==='server'&&r.frame.method&&r.frame.method!=='session/started').map(r=>r.frame);
export class FixturePort {
 constructor(){this.calls=[];this.counter=0;this.closed=false;}
 onNotification(fn){this.notify=fn;}onServerRequest(fn){this.serverRequest=fn;}onProtocolError(fn){this.protocolError=fn;}
 mintCommandId(){return '0198f0ab-9999-7000-8000-'+String(++this.counter).padStart(12,'0');}
 async command(method,params,options){this.calls.push({method,params,options});if(method==='session/start')return structuredClone(sessionResult);if(method==='turn/start')return {...turnAck,commandId:options.commandId};throw Error('Unexpected command '+method);}
 async request(method,params){this.calls.push({method,params});throw Error('Unexpected request '+method);}
 emit(frame){this.notify(structuredClone(frame));}
 async close(){this.closed=true;}
}
