const counters=['inputTokens','cachedTokens','outputTokens','reasoningTokens','calls','completedCalls','failedCalls','cancelledCalls'];
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function nativeUsage(payload){
 if(!payload||!Array.isArray(payload.models)||payload.models.length>64||typeof payload.children_included!=='boolean'||!['calls','completed_calls','failed_calls','cancelled_calls'].every(k=>count(payload[k])))return null;
 const result={inputTokens:0,cachedTokens:0,outputTokens:0,reasoningTokens:0,calls:payload.calls,completedCalls:payload.completed_calls,failedCalls:payload.failed_calls,cancelledCalls:payload.cancelled_calls,childrenIncluded:payload.children_included};
 for(const model of payload.models){
  if(!model||!['input_tokens','cached_tokens','output_tokens','reasoning_tokens','calls'].every(k=>count(model[k])))return null;
  for(const [key,native]of [['inputTokens','input_tokens'],['cachedTokens','cached_tokens'],['outputTokens','output_tokens'],['reasoningTokens','reasoning_tokens']])result[key]+=model[native];
 }
 return counters.every(k=>count(result[k]))?result:null;
}
export function combineUsage(runs){
 const values=runs.filter(Boolean);if(!values.length)return null;
 const result={...Object.fromEntries(counters.map(k=>[k,values.reduce((n,u)=>n+u[k],0)])),reportedRuns:values.length,totalRuns:runs.length,childrenIncluded:values.every(u=>u.childrenIncluded===true)?true:values.every(u=>u.childrenIncluded===false)?false:null};
 return restoreUsage(result);
}
export function restoreUsage(value){
 if(!value||!counters.every(k=>count(value[k]))||!count(value.reportedRuns)||!value.reportedRuns||!count(value.totalRuns)||value.reportedRuns>value.totalRuns||![true,false,null].includes(value.childrenIncluded))return null;
 return{...Object.fromEntries(counters.map(k=>[k,value[k]])),reportedRuns:value.reportedRuns,totalRuns:value.totalRuns,childrenIncluded:value.childrenIncluded};
}
