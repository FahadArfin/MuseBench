import test from 'node:test';
import assert from 'node:assert/strict';
import {projectChildRead} from '../src/runtime/child-inspection.mjs';
import {createChildTracker} from '../src/runtime/children.mjs';
import {validateAction} from '../electron/security.mjs';

const target={sessionId:'parent',itemId:'parent-item',childSessionId:'child',revision:2};
const message=(id,text='Hello')=>({itemId:id,kind:'agentMessage',revision:1,status:'completed',text});
const read=items=>({session:{sessionId:'child',parentSessionId:'parent',kind:'subagent',status:'notLoaded',modelId:'muse-spark-1.2',workspaceRoot:'C:/work'},history:{mode:'inline',items,snapshot:null},viewCursor:'head',pendingRequests:[]});

test('inspection only resolves an observed current child, never a renderer-supplied target',()=>{
 const tracker=createChildTracker();tracker.observe({itemId:'parent-item',kind:'subagent',childSessionId:'native-child',revision:2,status:'inProgress'});
 assert.throws(()=>tracker.inspect({itemId:'parent-item',revision:1}),/changed/);
 assert.throws(()=>tracker.inspect({itemId:'foreign',revision:2}),/changed/);
 assert.equal(tracker.inspect({itemId:'parent-item',revision:2,childSessionId:'forged'}).childSessionId,'native-child');
 tracker.observe({itemId:'no-id',kind:'subagent',revision:1,status:'completed'});assert.throws(()=>tracker.inspect({itemId:'no-id',revision:1}),/session/);
 tracker.observe({itemId:'workflow',kind:'workflow',childSessionId:'invented',revision:1,status:'completed'});assert.throws(()=>tracker.inspect({itemId:'workflow',revision:1}),/session/);
});
test('inspection IPC validates parent identities and revision independently of mutation controls',()=>{
 const action={type:'inspectChild',taskId:'task',sessionId:'parent',itemId:'item',revision:1};
 assert.doesNotThrow(()=>validateAction(action));
 for(const patch of [{revision:0},{taskId:''},{sessionId:'x'.repeat(201)}])assert.throws(()=>validateAction({...action,...patch}));
});
test('read projection rejects foreign child or parent identities and root sessions',()=>{
 for(const patch of [{sessionId:'other'},{parentSessionId:'other'},{kind:'root'}])assert.throws(()=>projectChildRead({...read([]),session:{...read([]).session,...patch}},target),/identity/);
 const result=read([]);delete result.session.parentSessionId;delete result.session.kind;assert.equal(projectChildRead(result,target).session.sessionId,'child');
 result.session.kind='future-child-kind';assert.equal(projectChildRead(result,target).session.kind,'future-child-kind');
});
test('native messages, tool output and unknown kinds survive as escaped-text data without arbitrary arguments',()=>{
 const result=projectChildRead(read([message('m','<script>alert(1)</script>'),{...message('t'),kind:'toolCall',tool:'read_file',args:'private-argument',visibleOutput:'File contents'},{...message('u'),kind:'futureItem',fallbackText:'New activity'}]),target);
 assert.equal(result.history.items[0].text,'<script>alert(1)</script>');assert.equal(result.history.items[1].text,'File contents');assert.equal(result.history.items[2].text,'New activity');
 assert.ok(!JSON.stringify(result).includes('private-argument'));assert.equal(result.tokens,undefined);assert.equal(result.worktree,undefined);
});
test('snapshot facts require a matching cursor and known schema, absent facts are not invented',()=>{
 const input=read([]);input.history={mode:'anchoredSnapshot',items:null,snapshot:{schemaVersion:1,viewCursor:'head',state:{items:[message('snapshot')],tokenUsage:{promptTokens:20,outputTokens:4,totalTokens:24}}}};
 input.worktree={worktreeRoot:'C:/work/child',baseCommit:'abc',headCommit:'def',ownership:'runtimeOwned',cleanupPolicy:'removeIfClean',cleanupState:'retained',parentDirtyExcluded:true};
 let result=projectChildRead(input,target);assert.equal(result.history.items[0].itemId,'snapshot');assert.equal(result.tokens.totalTokens,24);assert.equal(result.worktree.cleanupState,'retained');
 input.history.snapshot.viewCursor='different';result=projectChildRead(input,target);assert.equal(result.history.available,false);assert.equal(result.tokens,undefined);
 input.history.snapshot.viewCursor='head';input.history.snapshot.schemaVersion=2;assert.equal(projectChildRead(input,target).history.available,false);
 input.history={mode:'none',items:null,snapshot:null,noneReason:'tooLarge'};result=projectChildRead(input,target);assert.equal(result.history.available,false);assert.equal(result.history.totalItems,undefined);
});
test('large native histories retain recent activity within limits and report omissions and elision',()=>{
 const result=projectChildRead(read(Array.from({length:300},(_,i)=>message(String(i),'a'.repeat(10000)))),target);
 assert.equal(result.history.items.at(-1).itemId,'299');assert.ok(result.history.items.reduce((n,i)=>n+i.text.length,0)<=65536);assert.ok(result.history.items.every(i=>i.text.length<=8192));
 assert.equal(result.history.omittedItems,300-result.history.items.length);assert.equal(result.history.shortened,true);
 const elided=projectChildRead(read([{...message('tool'),kind:'toolCall',visibleOutput:'Tail',outputRef:{id:'output'},truncated:true}]),target);assert.equal(elided.history.shortened,true);
});
