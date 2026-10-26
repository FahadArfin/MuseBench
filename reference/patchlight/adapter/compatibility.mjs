export const TARGET = Object.freeze({sdkVersion:'1.4.13',hostVersion:'1.4.13',schemaVersion:1,fingerprint:'sha256:7fddaf646dbc317e5fcac0785e135eb04df14fbb0db1863089dfd6da21730e5b'});
// Exact candidate only: matching metadata is eligibility, never live verification.
export function compatibility({sdkVersion,initializeResult:h}={}){
 let reason;
 if(!h)reason='runtime-unavailable';
 else if(!h.serverInfo||!h.schema||typeof h.serverInfo.version!=='string'||typeof h.schema.fingerprint!=='string')reason='invalid-handshake';
 else if(sdkVersion!==TARGET.sdkVersion)reason='sdk-version-mismatch';
 else if(h.serverInfo.version!==TARGET.hostVersion)reason='host-version-mismatch';
 else if(h.schema.version!==TARGET.schemaVersion)reason='schema-version-mismatch';
 else if(h.schema.fingerprint!==TARGET.fingerprint)reason='schema-fingerprint-mismatch';
 else if(h.sandboxAvailability!=='available')reason='sandbox-unverified';
 return Object.freeze({available:!reason,reason:reason??'candidate-compatible',liveVerified:false,target:TARGET});
}
