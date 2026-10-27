import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAction} from '../electron/security.mjs';
test('connection action accepts only explicit boolean Full access',()=>{
 for(const fullAccess of [true,false])assert.equal(validateAction({type:'connectMuse',fullAccess}).fullAccess,fullAccess);
 assert.equal(validateAction({type:'connectMuse'}).fullAccess,undefined);
 for(const fullAccess of ['true',1,null,{}])assert.throws(()=>validateAction({type:'connectMuse',fullAccess}),/Full access/);
});
