import {workspaceOperations} from './workspace-analysis.mjs';
const names=new Set(workspaceOperations('analysis-v1').map(x=>x.name));
const prefix='mcp__musebench_workspace__workspace_tool_';
const tools=new Map([['search','Search workspace tools'],['call','Read workspace source'],['batch','Workspace analysis batch']].map(([name,title])=>[prefix+name,title]));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
const errors=new Set(['SEMANTIC_INPUT','SEMANTIC_PATH','SEMANTIC_POSITION','SEMANTIC_BUSY','SEMANTIC_LIMIT','SEMANTIC_STALE','SEMANTIC_TIMEOUT','SEMANTIC_DISPOSED','SEMANTIC_WORKER','SEMANTIC_UNAVAILABLE','SEMANTIC_CANCELLED','SEMANTIC_OUTPUT_LIMIT']);
export function normalizeWorkspaceBatchSummary(value){
 if(!object(value)||value.version!==1||!Array.isArray(value.calls)||!value.calls.length||value.calls.length>8)return null;
 const seen=new Set(),calls=[];
 for(const row of value.calls){
  if(!object(row)||!validId(row.id)||seen.has(row.id)||!names.has(row.operation)||!['completed','failed'].includes(row.status))return null;
  if(row.status==='failed'&&!errors.has(row.error)||row.count!==null&&(!Number.isInteger(row.count)||row.count<0||row.count>200)||row.path!==null&&(typeof row.path!=='string'||row.path.length>1000||/[\x00-\x1f\x7f]/.test(row.path)))return null;
  seen.add(row.id);calls.push({id:row.id,operation:row.operation,status:row.status,count:row.count,path:row.path,error:row.status==='failed'?row.error:null,truncated:row.truncated===true});
 }
 return{version:1,calls};
}
export function workspaceBatchSummary(tool,output,truncated=false){
 if(tool!==prefix+'batch'||truncated||typeof output!=='string'||output.length>131072)return null;
 try{
  let value=JSON.parse(output);
  if(Array.isArray(value?.content)&&value.content.length===1&&value.content[0]?.type==='text'&&typeof value.content[0].text==='string')value=JSON.parse(value.content[0].text);
  if(value?.kind!=='workspace-batch'||value.version!==1||!Array.isArray(value.calls)||value.calls.length>8)return null;
  return normalizeWorkspaceBatchSummary({version:1,calls:value.calls.map(row=>({id:row?.id,operation:row?.operation,status:row?.status,count:Array.isArray(row?.result?.items)?row.result.items.length:row?.result?.hover?1:null,path:typeof row?.result?.path==='string'?row.result.path:null,error:row?.error??null,truncated:row?.result?.truncated===true}))});
 }catch{return null;}
}
/** Observation only: never authorizes native controls or marks the parent done. */
export function createWorkspaceToolActivity(){
 const rows=new Map();let truncated=false;
 return{
  reset(){rows.clear();truncated=false;},
  observe(item,ownedTurns=[]){
   if(item?.kind!=='toolCall'||!tools.has(item.tool)||!ownedTurns.includes(item.turnId)||typeof item.itemId!=='string'||!item.itemId||item.itemId.length>200||!Number.isInteger(item.revision)||item.revision<1)return false;
   if((rows.get(item.itemId)?.revision??0)>=item.revision)return false;
   if(!rows.has(item.itemId)&&rows.size>=120){truncated=true;return false;}
   const statuses={inProgress:'working',completed:'completed',failed:'failed',cancelled:'cancelled',declined:'failed',interrupted:'interrupted'};
   const status=statuses[item.status]??'interrupted',output=typeof item.visibleOutput==='string'?item.visibleOutput:'';
   const workspaceBatch=status==='completed'?workspaceBatchSummary(item.tool,output,item.truncated===true):null;
   rows.set(item.itemId,{revision:item.revision,id:item.itemId,kind:'tool',title:tools.get(item.tool),tool:item.tool,status,detail:status==='working'?'Reading workspace source':status==='completed'?'Native tool completed':'Native tool did not complete',output:output.slice(0,6000),truncated:item.truncated===true||output.length>6000,...(workspaceBatch?{workspaceBatch}:{})});return true;
  },
  finish(status){for(const row of rows.values())if(row.status==='working'){row.status=status==='cancelled'?'cancelled':'interrupted';row.detail='No final tool result was reported';}},
  snapshot(){return{scope:'workspace-tools',items:structuredClone([...rows.values()].map(({revision,...row})=>row)),truncated};},
 };
}
