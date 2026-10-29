import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readUpdateBlockers} from '../electron/update-readiness.mjs';
import {createAppUpdates,updateBlocked} from '../electron/app-updates.mjs';
import {updateStateFlags} from '../src/shared/update-status.mjs';

test('restart flags avoid transcript and artifact access while retaining every native blocker',()=>{
 const forbidden=()=>assert.fail('Passive observation read retained content');
 for(const flags of [{busy:true},{runtime:{status:'running'}},{runtime:{cleanup:'pending'}},{runtime:{cleanup:'unconfirmed'}},{runtime:{pending:{}}},{runtime:{operationBusy:true}},{runtime:{childrenBusy:true}},{task:{check:{status:'running'}}},{task:{validationRun:{status:'running'}}},{task:{goal:{driver:{armed:true}}}}]){
  const native={...flags,task:{...flags.task,get messages(){return forbidden();},get runs(){return forbidden();}},get artifact(){return forbidden();}};
  assert.equal(updateBlocked(updateStateFlags(native)),true,JSON.stringify(flags));
 }
 assert.equal(updateBlocked(updateStateFlags({runtime:{status:'idle',cleanup:'confirmed'}})),false);
});

test('the complete ready-update observer uses only compact service reads',async()=>{
 const forbidden=()=>assert.fail('A ready-state poll read full state');let active=true,reads=0;
 const services={
  controller:{getState:forbidden,getUpdateBlockers:()=>active?[{id:'code:a',label:'Code · Launch',detail:'Working'}]:[]},
  work:{getState:forbidden,getUpdateState:()=>{reads++;return{busy:active,item:{title:'Report'}};}},
  sites:{getState:forbidden,getUpdateState:()=>{reads++;return{busy:false,site:{title:'Portfolio'},generation:{runtime:{cleanup:active?'unconfirmed':'confirmed'}}};}},
  dictation:{snapshot:()=>({status:active?'listening':'idle'})},
  operations:()=>[['app-control','App control',active]],
 };
 const updater=new EventEmitter();updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.2.9'});updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'0.2.9'});
 const updates=createAppUpdates({updater,version:'0.2.8',enabled:true,isBusy:forbidden,getBlockers:()=>readUpdateBlockers(services)});
 await updates.dispatch('check');await updates.dispatch('download');reads=0;
 assert.deepEqual((await updates.dispatch('status')).blockers.map(row=>row.label),['Code · Launch','Work · Report','Sites generation · Portfolio','Dictation','App control']);
 assert.equal(reads,2);active=false;reads=0;
 assert.deepEqual((await updates.dispatch('status')).blockers,[]);assert.equal(reads,2);
 services.work.getUpdateState=()=>{throw Error('private');};
 assert.match((await updates.dispatch('status')).blockers[0].detail,/not be confirmed/);
 updates.close();
});
