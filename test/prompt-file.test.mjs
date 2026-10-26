import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

test('large native prompts use a disposable UTF-8 file, not the Windows command line',async()=>{
 const module=await import('../src/runtime/prompt-file.mjs');
 const text='Context with quotes " and unicode 🦋\n'.repeat(800);
 const prepared=await module.preparePrompt(text);
 assert.deepEqual(prepared.args.slice(0,1),['--prompt-file']);
 assert.equal(await readFile(prepared.args[1],'utf8'),text);
 await prepared.dispose();await prepared.dispose();
 await assert.rejects(stat(prepared.args[1]),{code:'ENOENT'});
});
test('small prompts keep a positional delimiter and invalid sizes are rejected',async()=>{
 const {preparePrompt}=await import('../src/runtime/prompt-file.mjs');
 const prepared=await preparePrompt('--disable-sandbox');assert.deepEqual(prepared.args,['--','--disable-sandbox']);await prepared.dispose();
 await assert.rejects(preparePrompt('x'.repeat(70001)),/limit|large/i);
});
