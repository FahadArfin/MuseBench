import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAction } from '../electron/security.mjs';
import { DEFAULT_RUN_OPTIONS, validateRunOptions, restoreRunOptions, runBudget } from '../src/shared/run-options.mjs';
test('IPC validates finite run settings and rejects extra execution controls',()=>{
 assert.deepEqual(validateAction({type:'setRunOptions',runOptions:{reasoning:'max',approval:'auto'}}).runOptions,{reasoning:'max',approval:'auto'});
 for(const runOptions of [null,[],{reasoning:'max',approval:'yolo'},{reasoning:'oops',approval:'ask'},{reasoning:'high',approval:'ask',argv:['--disable-sandbox']}])assert.throws(()=>validateAction({type:'setRunOptions',runOptions}));
 assert.throws(()=>validateAction({type:'newTask',request:'Task',mode:'muse',runOptions:{reasoning:'high',approval:'unrestricted'}}));
});

test('new requests default to Extended while legacy saved options retain their other choices',()=>{
 assert.deepEqual(DEFAULT_RUN_OPTIONS,{reasoning:'high',approval:'ask',budget:'extended'});
 assert.deepEqual(validateRunOptions(),DEFAULT_RUN_OPTIONS);
 assert.deepEqual(restoreRunOptions(null),DEFAULT_RUN_OPTIONS);
 const legacy={model:'fixture-model',reasoning:'xhigh',approval:'never'};
 assert.deepEqual(restoreRunOptions(legacy),legacy);
 assert.deepEqual(runBudget(restoreRunOptions(legacy).budget),{label:'Extended',minutes:15,steps:32});
 assert.equal(Object.hasOwn(legacy,'budget'),false,'Restoring does not mutate saved input');
});

test('task budgets are finite presets and preserve explicit saved choices',()=>{
 const old={reasoning:'high',approval:'ask'};assert.deepEqual(restoreRunOptions(old),old);
 assert.deepEqual(runBudget('standard'),{label:'Standard',minutes:3,steps:8});
 assert.deepEqual(runBudget('extended'),{label:'Extended',minutes:15,steps:32});
 assert.deepEqual(runBudget('deep'),{label:'Deep',minutes:45,steps:96});
 for(const budget of ['standard','extended','deep']){
  const saved={...old,budget};assert.deepEqual(restoreRunOptions(saved),saved);
  assert.equal(validateRunOptions(saved).budget,budget);
 }
 for(const budget of ['unlimited',undefined,null,{},Infinity])assert.throws(()=>validateRunOptions({...old,budget}),/budget/);
});

test('budget lookup returns a copy without changing the presets',()=>{
 const selected=runBudget();selected.minutes=1;selected.steps=1;
 assert.deepEqual(runBudget(),{label:'Extended',minutes:15,steps:32});
});
