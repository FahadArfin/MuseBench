import test from 'node:test';
import assert from 'node:assert/strict';
import {appendDictation} from '../src/shared/dictation-budget.mjs';

test('speech insertion keeps the exact uninserted suffix for recovery',()=>{
 const draft='x'.repeat(15994),result=appendDictation(draft,'hello recover every word');
 assert.equal(result.text.length,16000);assert.equal(result.text.slice(-6),' hello');
 assert.equal(result.remainder,' recover every word');
});
test('a full draft retains all speech and never adds a separator by itself',()=>{
 const full='x'.repeat(16000),oneLeft='x'.repeat(15999);
 assert.deepEqual(appendDictation(full,'hello'),{text:full,remainder:'hello'});
 assert.deepEqual(appendDictation(oneLeft,'hello'),{text:oneLeft,remainder:'hello'});
});
test('speech suffixes reinsert without duplicate separators or missing characters',()=>{
 assert.deepEqual(appendDictation('Next message:',' recover every word'),{text:'Next message: recover every word',remainder:''});
 assert.deepEqual(appendDictation('Existing ','words'),{text:'Existing words',remainder:''});
 assert.deepEqual(appendDictation('','hello'),{text:'hello',remainder:''});
});
test('a prompt boundary never divides a speech Unicode surrogate pair',()=>{
 const short='x'.repeat(15998),fitting='x'.repeat(15997);
 assert.deepEqual(appendDictation(short,'😀 tail'),{text:short,remainder:'😀 tail'});
 const result=appendDictation(fitting,'😀 tail');
 assert.equal(result.text.length,16000);assert.equal(result.text.slice(-3),' 😀');assert.equal(result.remainder,' tail');
});
