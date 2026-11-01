import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedWhileBillingBlocked as allowed} from '../electron/billing-action-policy.mjs';

test('billing cleanup cannot trap the user behind disabled stop and navigation actions',()=>{
 for(const type of ['refresh','selectTask','selectProject','disconnectMuse','stopWork','cancelCheck','pauseQueue'])assert.equal(allowed('musebench:action',{type}),true,type);
 assert.equal(allowed('musebench:action',{type:'childControl',action:'stop'}),true);
 assert.equal(allowed('musebench:work',{type:'stop'}),true);
});

test('new execution and unknown commands remain blocked until payer ownership settles',()=>{
 for(const type of ['sendMessage','connectMuse','newTask','resumeQueue','runCheck','runValidation','setExecutionAccess'])assert.equal(allowed('musebench:action',{type}),false,type);
 assert.equal(allowed('musebench:action',{type:'childControl',action:'retry'}),false);
 assert.equal(allowed('musebench:action',{type:'codeSchedule',operation:'enable'}),false);
 assert.equal(allowed('musebench:sites',{type:'send'}),false);
 assert.equal(allowed('musebench:work',{type:'send'}),false);
 assert.equal(allowed('musebench:action',null),false);
});
