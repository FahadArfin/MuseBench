import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAction} from '../electron/security.mjs';
import {restoreRuns} from '../src/shared/activity.mjs';
const api=await import('../src/shared/workspace-tool-activity.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const tool='mcp__musebench_workspace__workspace_tool_batch';
const output=()=>({kind:'workspace-batch',version:1,calls:[{id:'symbols',operation:'workspace_symbols',status:'completed',result:{items:[{name:'value'}],snapshot:'a'.repeat(64)}},{id:'bad',operation:'hover',status:'failed',error:'SEMANTIC_POSITION'}]});
const item=()=>({itemId:'batch-one',kind:'toolCall',tool,revision:1,turnId:'owned-turn',status:'completed',visibleOutput:JSON.stringify(output())});

test('connection IPC rejects unknown or inapplicable toolsets',()=>{
 for(const action of [{workspaceTools:true,transport:'msp',workspaceToolset:'all'},{workspaceTools:false,transport:'msp',workspaceToolset:'analysis-v1'},{workspaceTools:true,transport:'exec',workspaceToolset:'analysis-v1'}])assert.throws(()=>validateAction({type:'connectMuse',...action}));
 validateAction({type:'connectMuse',transport:'msp',workspaceTools:true,workspaceToolset:'analysis-v1'});
});
test('batch summaries accept only owned complete bounded receipts',()=>{
 assert.equal(typeof api.workspaceBatchSummary,'function');
 const parsed=api.workspaceBatchSummary(tool,JSON.stringify(output()));assert.equal(parsed.calls[0].count,1);assert.equal(parsed.calls[1].error,'SEMANTIC_POSITION');
 assert.deepEqual(api.workspaceBatchSummary(tool,JSON.stringify({content:[{type:'text',text:JSON.stringify(output())}]})),parsed);
 for(const [name,text,truncated] of [['mcp__foreign__workspace_tool_batch',JSON.stringify(output())],[tool,JSON.stringify(output()),true],[tool,'{partial'],[tool,' '.repeat(131073)],[tool,JSON.stringify({...output(),calls:[...output().calls,...output().calls]})]])assert.equal(api.workspaceBatchSummary(name,text,truncated),null);
});
test('workspace tool activity binds owner, revision and bounded output without inferring completion',()=>{
 assert.equal(typeof api.createWorkspaceToolActivity,'function');const tracker=api.createWorkspaceToolActivity();
 tracker.observe(item(),['foreign-turn']);assert.equal(tracker.snapshot().items.length,0);
 tracker.observe({...item(),tool:'mcp__other__workspace_tool_batch'},['owned-turn']);assert.equal(tracker.snapshot().items.length,0);
 tracker.observe(item(),['owned-turn']);assert.equal(tracker.snapshot().items[0].workspaceBatch.calls.length,2);
 tracker.observe({...item(),status:'inProgress'},['owned-turn']);assert.equal(tracker.snapshot().items[0].status,'completed');
 tracker.reset();tracker.observe({...item(),status:'inProgress',visibleOutput:''},['owned-turn']);tracker.finish('completed');assert.equal(tracker.snapshot().items[0].status,'interrupted');
 const large=output();large.calls[0].result.items=Array.from({length:80},()=>({name:'x'.repeat(150)}));tracker.reset();tracker.observe({...item(),visibleOutput:JSON.stringify(large)},['owned-turn']);const row=tracker.snapshot().items[0];assert.equal(row.workspaceBatch.calls[0].count,80);assert.ok(row.output.length<=6000);assert.equal(row.truncated,true);
 const run={id:'run',promptId:'prompt',prompt:'Inspect',startedAt:new Date().toISOString(),status:'completed',activities:[row]};assert.equal(restoreRuns([run])[0].activities[0].workspaceBatch.calls[0].count,80);
});
test('native rejected tool receipts show a refusal rather than an interrupted read',()=>{
 const tracker=api.createWorkspaceToolActivity();tracker.observe({...item(),status:'rejected',visibleOutput:undefined},['owned-turn']);
 const row=tracker.snapshot().items[0];assert.equal(row.status,'failed');assert.equal(row.detail,'Tool request was not approved');assert.equal(row.output,'');assert.equal(row.workspaceBatch,undefined);
});
