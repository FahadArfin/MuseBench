import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativeSession,restoreNativeSession,settleNativeSession} from '../src/shared/native-session.mjs';
test('native session migration seeds history once and never crosses roots or interrupted runs',()=>{
 const first=prepareNativeSession(null,'C:\\project');assert.equal(first.history,true);
 const ready=settleNativeSession(first.session,{status:'completed',cleanup:'confirmed',nativeSessionId:first.session.id},true);
 assert.equal(ready.seeded,true);const next=prepareNativeSession(ready,'C:\\project');assert.equal(next.history,false);assert.equal(next.session.id,first.session.id);
 assert.throws(()=>prepareNativeSession(ready,'C:\\other'),/folder/);
 const interrupted=restoreNativeSession(next.session);assert.equal(interrupted.status,'needs-recovery');assert.throws(()=>prepareNativeSession(interrupted,'C:\\project'),/Session/);
 const wrong=settleNativeSession(first.session,{status:'completed',cleanup:'confirmed',nativeSessionId:'wrong'},true);assert.equal(wrong.status,'needs-recovery');assert.equal(wrong.seeded,false);
});
test('MSP identity and access survive restore and cannot migrate to a different root, transport or host session',()=>{
 const value={id:'native-session-owned',root:'C:\\project',transport:'msp',seeded:true,status:'ready',fullAccess:true,workspaceTools:true};
 assert.deepEqual(restoreNativeSession(value),value);
 const connection={transport:'msp',nativeSessionId:value.id};
 assert.equal(prepareNativeSession(value,value.root,connection).history,false);
 assert.throws(()=>prepareNativeSession(value,'C:\\another-project',connection),/folder/);
 assert.throws(()=>prepareNativeSession(value,value.root,{transport:'exec'}),/transport/);
 assert.throws(()=>prepareNativeSession(value,value.root,{...connection,nativeSessionId:'foreign-session'}),/changed/);
 assert.throws(()=>prepareNativeSession(null,value.root,{transport:'msp'}),/changed/);
});
test('explicit analysis toolset survives restore while old saved sessions never upgrade',()=>{
 const value={id:'native',root:'C:/project',transport:'msp',seeded:false,status:'ready',workspaceTools:true,workspaceToolset:'analysis-v1'};
 assert.equal(restoreNativeSession(value).workspaceToolset,'analysis-v1');
 assert.equal(prepareNativeSession(null,value.root,{transport:'msp',nativeSessionId:'native',workspaceTools:true,workspaceToolset:'analysis-v1'}).session.workspaceToolset,'analysis-v1');
 const {workspaceToolset,...legacy}=value;assert.equal(restoreNativeSession(legacy).workspaceToolset,undefined);
 const blocked=restoreNativeSession({...value,workspaceToolset:'analysis-v2'});assert.equal(blocked.id,value.id);assert.equal(blocked.unsupportedWorkspaceToolset,'analysis-v2');assert.equal(blocked.status,'needs-recovery');assert.deepEqual(restoreNativeSession(blocked),blocked);assert.throws(()=>prepareNativeSession(blocked,value.root,{transport:'msp',nativeSessionId:value.id}),/unsupported workspace tool set/i);
});

test('malformed saved tool selections keep identity and require explicit recovery',()=>{
 const value={id:'native',root:'C:/project',transport:'msp',seeded:true,status:'ready',workspaceTools:true};
 for(const patch of [{workspaceToolset:null},{workspaceToolset:{}},{unsupportedWorkspaceToolset:{}},{unsupportedWorkspaceToolset:false}]){const restored=restoreNativeSession({...value,...patch});assert.equal(restored.id,value.id);assert.equal(restored.unsupportedWorkspaceToolset,true);assert.equal(restored.status,'needs-recovery');assert.deepEqual(restoreNativeSession(restored),restored);}
 const restored=restoreNativeSession({...value,status:'needs-recovery',unsupportedWorkspaceToolset:'analysis-v1'});assert.equal(restored.workspaceToolset,'analysis-v1');assert.equal(restored.unsupportedWorkspaceToolset,undefined);
});
