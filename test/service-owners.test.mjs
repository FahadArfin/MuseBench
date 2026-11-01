import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceOwners} from '../electron/service-owners.mjs';

test('destroying a window cannot lose a sign-in owner with unconfirmed cleanup',async()=>{
 const owners=createServiceOwners();let running=true;
 const owner=owners.add({isBusy:()=>running,close:async()=>{throw Error('Sign-in cleanup is unconfirmed.');}});
 assert.equal(owners.isBusy(),true);
 await assert.rejects(owners.close(owner));
 assert.equal(owners.isBusy(),true,'the detached window still owns a potentially live child');
 running=false;assert.equal(owners.isBusy(),false,'confirmed late exit releases the blocker');
 await owners.closeAll();
});

test('a throwing owner stays blocked and all owners receive shutdown',async()=>{
 const owners=createServiceOwners(),closed=[];
 owners.add({isBusy:()=>{throw Error('Unknown state');},close:async()=>{closed.push('first');throw Error('Unconfirmed');}});
 owners.add({isBusy:()=>false,close:async()=>closed.push('second')});
 assert.equal(owners.isBusy(),true);await assert.rejects(owners.closeAll(),/cleanup/i);
 assert.deepEqual(closed.sort(),['first','second']);assert.equal(owners.isBusy(),true);
});
