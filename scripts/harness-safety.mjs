import {TARGET, compatibility} from '../reference/patchlight/adapter/compatibility.mjs';
import {parseMuseVersion} from '../src/runtime/index.mjs';

const sensitiveKey=/^(?:.*(?:password|secret)|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|decisionToken)$/i;

export function redact(value) {
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitiveKey.test(key)?'[REDACTED]':redact(item)]));
 if(typeof value!=='string')return value;
 const trimmed=value.trim();
 if(trimmed.startsWith('{')||trimmed.startsWith('[')){
  try{return JSON.stringify(redact(JSON.parse(trimmed)));}catch{/* A log fragment is redacted below. */}
 }
 return value
  .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,'[REDACTED PRIVATE KEY]')
  .replace(/\b(?:sk-|mkey_|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g,'[REDACTED TOKEN]')
  .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,'$1[REDACTED]')
  .replace(/([?&](?:token|api[_-]?key|secret|password|code)=)[^\s&#"']+/gi,'$1[REDACTED]')
  .replace(/("(?:[^"]*(?:password|secret)|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie)"\s*:\s*)(?:"(?:\\.|[^"\\])*"?|[^\s,}]+)/gi,'$1"[REDACTED]"')
  .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie)\s*[:=]\s*)(?:"[^"]*"?|'[^']*'?|[^\s,}]+)/gi,'$1[REDACTED]');
}

export function diagnosticText(value,limit=65536) {
 const safe=redact(value??null);
 const text=typeof safe==='string'?safe:JSON.stringify(safe,null,2);
 return text.length>limit?text.slice(0,limit)+'\n[TRUNCATED]':text;
}

// Persist only fixed vocabulary and counts. Request contents stay in the UI.
export function permissionReport(pending) {
 const choices=Array.isArray(pending?.availableChoices)?pending.availableChoices:[];
 return {kind:['approval','input'].includes(pending?.kind)?pending.kind:'unknown',
  oneTimeChoices:{approve:choices.filter(c=>c?.scope==='once'&&c.decision==='approved').length,
   deny:choices.filter(c=>c?.scope==='once'&&['denied','abort'].includes(c.decision)).length},
  details:'Request contents are displayed only in MuseBench and are not logged.'};
}

export function probeEligibility({sdkVersion,sdkFingerprint,version,initializeResult}) {
 let reason;
 try{if(parseMuseVersion(version)!==TARGET.hostVersion)reason='cli-version-mismatch';}
 catch{reason='unrecognized-cli-version';}
 if(!reason&&sdkFingerprint!==TARGET.fingerprint)reason='sdk-fingerprint-mismatch';
 const gate=compatibility({sdkVersion,initializeResult});
 if(!reason&&!gate.available)reason=gate.reason;
 if(!reason&&initializeResult?.experimentalApi!==true)reason='experimental-permissions-unavailable';
 return {available:!reason,reason:reason??'candidate-compatible',
  status:!reason?'host-eligible-not-model-tested':reason==='sandbox-unverified'?'host-sandbox-unavailable':'host-incompatible'};
}

export async function confirmNativeShutdown(dispatch,{timeoutMs=25000}={}) {
 let timer;
 try{
  const state=await Promise.race([Promise.resolve().then(()=>dispatch({type:'disconnectMuse'})),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native Muse shutdown confirmation timed out.')),timeoutMs);})]);
  const cleanup=state?.runtime?.cleanup;
  if(state?.error||state?.runtime?.sessionId||!['confirmed','not-started'].includes(cleanup))throw Error('Native Muse shutdown could not be confirmed.');
  return cleanup;
 }finally{clearTimeout(timer);}
}
