export const TARGET = Object.freeze({sdkVersion:'1.4.14',hostVersion:'1.4.14',schemaVersion:1,fingerprint:'sha256:c94c3d1f2f51e6424074b9ec43eac3eedcf532d3dcd77351ec1383a87d3049c6'});
// Exact candidate only: matching metadata is eligibility, never live verification.
export function compatibility({sdkVersion,initializeResult:h,fullAccess=false}={}){
 let reason;
 if(!h)reason='runtime-unavailable';
 else if(!h.serverInfo||!h.schema||typeof h.serverInfo.version!=='string'||typeof h.schema.fingerprint!=='string')reason='invalid-handshake';
 else if(sdkVersion!==TARGET.sdkVersion)reason='sdk-version-mismatch';
 else if(h.serverInfo.version!==TARGET.hostVersion)reason='host-version-mismatch';
 else if(h.schema.version!==TARGET.schemaVersion)reason='schema-version-mismatch';
 else if(h.schema.fingerprint!==TARGET.fingerprint)reason='schema-fingerprint-mismatch';
 else if(h.sandboxAvailability!=='available'&&fullAccess!==true)reason='sandbox-unverified';
 return Object.freeze({available:!reason,reason:reason??'candidate-compatible',liveVerified:false,target:TARGET});
}
