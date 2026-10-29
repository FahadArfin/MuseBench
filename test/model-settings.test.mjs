import test from 'node:test';import assert from 'node:assert/strict';
import {modelSettingsView} from '../src/shared/model-settings.mjs';
const options={model:'muse-wonderful',reasoning:'high',approval:'ask'};
const catalog={source:'bundledCatalog',models:[{id:'muse-wonderful',label:'Wonderful',isDefault:true,efforts:['low','high']},{id:'muse-spark',label:'Spark',efforts:['low','high']}]};
test('saved choices are next-request settings, never proof of native application',()=>{
 const view=modelSettingsView({options,runtime:{modelCatalog:catalog,modelId:'muse-spark',status:'unavailable'}});
 assert.equal(view.requested.model,'Wonderful');assert.equal(view.requested.effort,'high');assert.equal(view.observed,null);assert.equal(view.effectiveEffort,null);
});
test('interactive read-back distinguishes session model from an accepted current run',()=>{
 const runtime={transport:'msp',status:'idle',permissionVerified:true,sessionId:'s',modelId:'muse-spark',modelCatalog:catalog};
 assert.deepEqual(modelSettingsView({options,runtime}).observed,{label:'Session model',model:'Spark',id:'muse-spark'});
 assert.equal(modelSettingsView({options,runtime:{...runtime,status:'running',inputAccepted:false}}).observed.label,'Session model');
 const current=modelSettingsView({options,runtime:{...runtime,status:'running',inputAccepted:true,runId:'r',runOptions:{reasoning:'low'}}});
 assert.equal(current.observed.label,'Current run');assert.equal(current.submittedEffort,'low');assert.equal(current.effectiveEffort,null);assert.equal(current.requested.effort,'high');
});
test('exec startup and uncertain/reconnected state never expose stale models as active',()=>{
 const runtime={transport:'exec',status:'running',permissionVerified:true,inputAccepted:true,runId:'r',modelId:'muse-spark',modelCatalog:catalog};
 assert.equal(modelSettingsView({options,runtime}).observed.label,'Current run');
 for(const patch of [{inputAccepted:false},{runId:null},{status:'idle'},{status:'connecting'},{status:'uncertain'},{status:'unavailable'},{permissionVerified:false}])assert.equal(modelSettingsView({options,runtime:{...runtime,...patch}}).observed,null,JSON.stringify(patch));
 assert.equal(modelSettingsView({options,runtime:{...runtime,status:'completed',cleanup:'confirmed'}}).observed.label,'Last run');
});
test('unavailable selected models and missing native effort remain explicit',()=>{
 const view=modelSettingsView({options:{...options,model:'missing'},runtime:{modelCatalog:catalog}});
 assert.equal(view.requested.model,'missing');assert.equal(view.requested.unavailable,true);assert.equal(view.effectiveEffort,null);
 assert.equal(modelSettingsView({options:{reasoning:'low'},runtime:{modelCatalog:catalog}}).requested.model,'Provider default · Wonderful');
});
