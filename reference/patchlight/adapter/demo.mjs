import {MuseSessionAdapter} from './session-adapter.mjs';
import {ReviewPackage} from './review.mjs';
import {FixturePort,descriptor,events,sessionResult} from './test/fixture-port.mjs';
const port=new FixturePort();
const adapter=new MuseSessionAdapter({connection:port,...descriptor()});
const review=new ReviewPackage();
console.log('OFFLINE FIXTURE DEMO — no SDK package, CLI, credentials, model, or test command is executed.');
await adapter.open(sessionResult.session.workspaceRoot);
await adapter.send({text:'Propose a caffeine-free filter.',mode:'plan'});
for(const frame of events)port.emit(frame);
console.log(JSON.stringify({runtime:adapter.snapshot(),reviewBeforeRunnerEvidence:review.snapshot()},null,2));
review.approvePlan('fixture-plan-1');review.setRevision('fixture-revision-1');review.setRuntime(adapter.snapshot().status);review.inspectPreview('fixture-revision-1');
try{review.accept('fixture-revision-1');}catch(error){console.log('Correctly blocked:',error.message);}
// Synthetic controller input, explicitly NOT evidence from a real test execution.
review.recordCheck({revision:'fixture-revision-1',command:'fixture-only (not executed)',exitCode:0,finished:true,logId:'synthetic-log-1',source:'runner'});
console.log('Fixture acceptance only:',JSON.stringify(review.accept('fixture-revision-1')));
await adapter.close();
