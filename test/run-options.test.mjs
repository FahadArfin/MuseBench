import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAction } from '../electron/security.mjs';
test('IPC validates finite run settings and rejects extra execution controls',()=>{
 assert.deepEqual(validateAction({type:'setRunOptions',runOptions:{reasoning:'max',approval:'auto'}}).runOptions,{reasoning:'max',approval:'auto'});
 for(const runOptions of [null,[],{reasoning:'max',approval:'yolo'},{reasoning:'oops',approval:'ask'},{reasoning:'high',approval:'ask',argv:['--disable-sandbox']}])assert.throws(()=>validateAction({type:'setRunOptions',runOptions}));
 assert.throws(()=>validateAction({type:'newTask',request:'Task',mode:'muse',runOptions:{reasoning:'high',approval:'unrestricted'}}));
});

test('task budgets are finite presets and preserve older saved options',async()=>{
 const {validateRunOptions,restoreRunOptions,runBudget}=await import('../src/shared/run-options.mjs');
 const old={reasoning:'high',approval:'ask'};assert.deepEqual(restoreRunOptions(old),old);
 assert.deepEqual(runBudget('standard'),{label:'Standard',minutes:3,steps:8});
 assert.deepEqual(runBudget('extended'),{label:'Extended',minutes:15,steps:32});
 assert.deepEqual(runBudget('deep'),{label:'Deep',minutes:45,steps:96});
 assert.equal(validateRunOptions({...old,budget:'deep'}).budget,'deep');
 for(const budget of ['unlimited',null,{},Infinity])assert.throws(()=>validateRunOptions({...old,budget}),/budget/);
});
