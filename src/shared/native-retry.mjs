import {validContextSourceRange} from './native-context-usage.mjs';
const count=value=>Number.isSafeInteger(value)&&value>=1;
/** A single current-turn observation, never a retry policy or an absolute fire time. */
export function observeNativeRetry(method,p){
 const kind=method==='turn/modelRetryScheduled'?'model':method==='turn/retryScheduled'?'turn':null;
 const source=p?.sourceRange;
 if(!kind||!count(p?.attempt)||!count(p.nextAttempt)||!count(p.maxAttempts)||p.attempt>=p.nextAttempt||p.nextAttempt>p.maxAttempts||!Number.isSafeInteger(p.retryDelayMs)||p.retryDelayMs<0||!validContextSourceRange(source)||source.stream.kind!=='session'||source.stream.id!==p.sessionId||source.first.id!==source.last.id||source.first.sequence!==source.last.sequence)return null;
 return {kind,attempt:p.attempt,nextAttempt:p.nextAttempt,maxAttempts:p.maxAttempts,retryDelayMs:p.retryDelayMs};
}
export function nativeRetryText(value){
 if(!value||!['model','turn'].includes(value.kind)||!count(value.attempt)||!count(value.nextAttempt)||!count(value.maxAttempts)||value.attempt>=value.nextAttempt||value.nextAttempt>value.maxAttempts||!Number.isSafeInteger(value.retryDelayMs)||value.retryDelayMs<0)return null;
 return `Muse scheduled a ${value.kind} retry · attempt ${value.nextAttempt} of ${value.maxAttempts} · scheduled delay ${value.retryDelayMs.toLocaleString('en-US')} ms. Remaining delay unknown.`;
}
