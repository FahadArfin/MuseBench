import {normalizeWorkspaceBatchSummary} from './workspace-tool-activity.mjs';
const text=(value,max=1000)=>typeof value==='string'?value.slice(0,max):'';
const id=value=>typeof value==='string'&&value.length>0&&value.length<=1024;
const live=status=>['working','queued','waiting'].includes(status);
const statuses=new Set(['queued','working','waiting','completed','failed','cancelled','interrupted']);
const titles={powershell:'Run PowerShell',shell:'Run command',read_file:'Read file',write_file:'Write file',edit_file:'Edit file',apply_patch:'Apply patch',list_directory:'List files',grep:'Search files',glob:'Find files'};
export const activityTitle=kind=>kind.startsWith('model.')?'Thinking':titles[kind.replace(/^tool\./,'')]??kind.replace(/^tool\./,'').replace(/[._-]+/g,' ').replace(/^./,c=>c.toUpperCase());

// This projection is observational. Only the exec fold validates run success.
// Missing/unknown task shapes are omitted, never promoted to execution proof.
export function createActivityProjection({maxItems=120,maxDetail=1500}={}){
 const items=new Map();let truncated=false;
 function accept(record,root){
  const p=record?.payload,e=p?.event,type=record?.payload_type;
  if(!type?.startsWith('task.lifecycle.')||p.kind!=='task_lifecycle'||!e||type!==`task.lifecycle.${e.kind}`||!id(p.task_id)||p.task_stream?.kind!=='task'||p.task_stream.id!==p.task_id||e.task_id!==p.task_id||p.command_id!==root.commandId||p.run_stream?.kind!=='run'||p.run_stream.id!==root.runId||!root.runId)return;
  let item=items.get(p.task_id);
  if(!item){
   if(e.kind!=='proposed'||!id(e.task_kind))return;
   if(items.size>=maxItems){truncated=true;return;}
   item={id:p.task_id,kind:e.task_kind.startsWith('model.')?'model':'tool',title:activityTitle(e.task_kind),tool:e.task_kind,status:'queued',detail:'Waiting to start',output:''};items.set(item.id,item);
  }
  if(['completed','failed','cancelled','interrupted'].includes(item.status))return;
  switch(e.kind){
   case 'started':item.status='working';item.detail=item.kind==='model'?'Muse is thinking…':'Running';break;
   case 'status':if(typeof e.message==='string')item.detail=text(e.message);break;
   case 'side_effect_intent':if(/^(prompt|ask|approval_required)(:|_|$)/i.test(e.policy_decision??'')){item.status='waiting';item.detail='Waiting for approval';}break;
   case 'output':if(item.kind!=='model'&&typeof e.chunk==='string'){const combined=item.output+e.chunk;item.output=combined.slice(-maxDetail);if(combined.length>maxDetail){item.truncated=true;truncated=true;}}break;
   case 'completed':item.status='completed';item.detail='Completed';break;
   case 'failed':item.status='failed';item.detail=text(e.reason)||'Task failed';break;
  }
 }
 return {accept,finish(status){for(const item of items.values())if(live(item.status)){item.status=status==='cancelled'?'cancelled':'interrupted';item.detail=status==='completed'?'No final task status reported':'Run stopped before this task finished';}},snapshot(){return{items:[...items.values()].map(item=>({...item})),truncated};}};
}

export function restoreRuns(value,{interrupt=true}={}){
 if(!Array.isArray(value))return[];
 let bytes=0;const result=[];
 for(const run of value.slice(-40).reverse()){
  if(!run||!id(run.id)||!id(run.promptId)||typeof run.prompt!=='string'||!Number.isFinite(Date.parse(run.startedAt))||!statuses.has(run.status))continue;
  const activities=(Array.isArray(run.activities)?run.activities:[]).slice(0,120).filter(item=>item&&id(item.id)&&['model','tool','agent'].includes(item.kind)&&statuses.has(item.status)).map(item=>({id:item.id,kind:item.kind,title:text(item.title,160),tool:text(item.tool,160),status:interrupt&&live(item.status)?'interrupted':item.status,detail:text(item.detail),output:text(item.output,6000),truncated:item.truncated===true,...(item.tool==='mcp__musebench_workspace__workspace_tool_batch'&&item.status==='completed'&&normalizeWorkspaceBatchSummary(item.workspaceBatch)?{workspaceBatch:normalizeWorkspaceBatchSummary(item.workspaceBatch)}:{}),...(item.agentId?{agentId:text(item.agentId,200)}:{} ),...(item.tool==='workflow'&&id(item.workflow?.parentRunId)&&Number.isSafeInteger(item.workflow?.parallelLimit)&&item.workflow.parallelLimit>0?{workflow:{parentRunId:item.workflow.parentRunId,parallelLimit:item.workflow.parallelLimit}}:{})}));
  const normalized={id:run.id,promptId:run.promptId,prompt:text(run.prompt,1000),runId:id(run.runId)?run.runId:null,ownedRunIds:Array.isArray(run.ownedRunIds)?run.ownedRunIds.filter(id).slice(0,5):[],status:interrupt&&live(run.status)?'interrupted':run.status,startedAt:run.startedAt,...(Number.isFinite(Date.parse(run.endedAt))?{endedAt:run.endedAt}:{}),reason:text(run.reason),activities,truncated:run.truncated===true};
  bytes+=JSON.stringify(normalized).length;if(bytes>300000)break;result.push(normalized);
 }
 return result.reverse();
}
