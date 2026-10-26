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
