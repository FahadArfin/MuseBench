import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAction } from '../electron/security.mjs';
test('IPC validates finite run settings and rejects extra execution controls',()=>{
 assert.deepEqual(validateAction({type:'setRunOptions',runOptions:{reasoning:'max',approval:'auto'}}).runOptions,{reasoning:'max',approval:'auto'});
 for(const runOptions of [null,[],{reasoning:'max',approval:'yolo'},{reasoning:'oops',approval:'ask'},{reasoning:'high',approval:'ask',argv:['--disable-sandbox']}])assert.throws(()=>validateAction({type:'setRunOptions',runOptions}));
 assert.throws(()=>validateAction({type:'newTask',request:'Task',mode:'muse',runOptions:{reasoning:'high',approval:'unrestricted'}}));
});
