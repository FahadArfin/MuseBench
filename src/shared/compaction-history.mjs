const statuses=new Set(['in-progress','compacted','noop','failed','cancelled','unknown']);
const outcomes=new Set(['compacted','noop','failed','cancelled']);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):undefined;
function normalize(value){
 if(!value||!['sessionId','itemId','turnId'].every(key=>id(value[key]))||!Number.isSafeInteger(value.revision)||value.revision<1||!statuses.has(value.status)||!['live','restored'].includes(value.source)||typeof value.at!=='string'||value.at.length>50||!Number.isFinite(Date.parse(value.at)))return null;
 const row={sessionId:value.sessionId,itemId:value.itemId,turnId:value.turnId,revision:value.revision,trigger:['auto','manual'].includes(value.trigger)?value.trigger:'unknown',status:value.status,source:value.source,at:value.at};
 for(const key of ['tokensBefore','tokensAfter'])if(Number.isSafeInteger(value[key])&&value[key]>=0)row[key]=value[key];
 // Opaque provenance is displayed only. Do not truncate it into another handle.
 if(typeof value.summarizedThrough==='string'&&value.summarizedThrough.length<=4096)row.summarizedThrough=value.summarizedThrough;
 if(typeof value.reason==='string')row.reason=text(value.reason,1000);
 return row;
}
export function observeCompaction(item,{sessionId,source='live',at=new Date().toISOString()}={}){
 if(item?.kind!=='compaction')return null;
 const status=item.status==='inProgress'?'in-progress':item.status==='completed'&&outcomes.has(item.outcome)?item.outcome:['failed','cancelled'].includes(item.status)&&item.outcome===item.status?item.status:'unknown';
 return normalize({...item,sessionId,source,at,status});
}
export function mergeCompactionHistory(previous,incoming){
 const rows=new Map();
 for(const value of [...(Array.isArray(previous)?previous:[]),...(Array.isArray(incoming)?incoming:[])]){
  const row=normalize(value);if(!row)continue;
  const key=JSON.stringify([row.sessionId,row.itemId]),old=rows.get(key);
  if(old&&(row.turnId!==old.turnId||row.revision<old.revision||row.revision===old.revision&&!(old.status==='in-progress'&&row.status==='unknown')))continue;
  rows.set(key,old?{...row,at:old.at}:row);
  if(rows.size>30)rows.delete(rows.keys().next().value);
 }
 return [...rows.values()];
}
export function interruptCompactionHistory(history){
 return mergeCompactionHistory([],history).map(row=>row.status==='in-progress'?{...row,status:'unknown',reason:'Native completion was not observed before the connection ended. No request will be replayed.'}:row);
}
