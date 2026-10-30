const identity=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max;
const count=v=>Number.isSafeInteger(v)&&v>=0;
const pressures=new Set(['normal','warning','blocked']);

// This is a provider-reported occupancy floor, not billing or a token estimate.
export function normalizeContextUsage(value,{sessionId,viewCursor,source,observedAt}={}){
 if(!value||!count(value.usedTokens)||!identity(sessionId)||typeof viewCursor!=='string'||viewCursor.length>4096||source==='live'&&!viewCursor||!['live','restored'].includes(source)||typeof observedAt!=='string'||observedAt.length>64||!Number.isFinite(Date.parse(observedAt)))return null;
 return {sessionId,viewCursor,source,observedAt,usedTokens:value.usedTokens,windowTokens:count(value.windowTokens)&&value.windowTokens>0?value.windowTokens:null,pressure:pressures.has(value.pressure)?value.pressure:'unknown',connected:false};
}
export function restoreContextUsage(value){return value?normalizeContextUsage(value,value):null;}
export function contextUsagePresentation(reading){
 const value=restoreContextUsage(reading);
 if(!value)return {label:'Context',percentage:null,meter:null};
 const percentage=value.windowTokens===null?null:Math.floor(value.usedTokens/value.windowTokens*1000)/10;
 return {label:percentage===null?`Context · ${value.usedTokens.toLocaleString('en-US')} tokens`:`Context · ≥${percentage.toLocaleString('en-US')}%`,percentage,meter:percentage===null?null:Math.min(100,percentage)};
}

export function validContextSourceRange(value){
 const position=p=>p&&identity(p.id,512)&&count(p.sequence);
 return !!(value&&identity(value.stream?.id,512)&&identity(value.stream?.kind,80)&&position(value.first)&&position(value.last)&&value.last.sequence>=value.first.sequence);
}
