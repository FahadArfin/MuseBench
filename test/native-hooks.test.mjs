import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
const api=await import('../src/shared/native-hooks.mjs').catch(()=>({}));
const item={id:'check',event:'UserPromptSubmit',command:'echo checked',timeout:3,enabled:true};
test('reviewed hooks have a closed bounded schema and native Windows projection',()=>{
 assert.equal(typeof api.validateHooks,'function');assert.deepEqual(api.nativeHooks([item],'win32'),{UserPromptSubmit:[{hooks:[{type:'command',commandWindows:'echo checked',timeout:3}]}]});
 for(const value of [[{...item,async:true}],[{...item,event:'PermissionRequest'}],[{...item,timeout:0}],[{...item,timeout:31}],[{...item,command:'x'.repeat(1501)}],[item,item]])assert.throws(()=>api.validateHooks(value));
 assert.deepEqual(api.nativeHooks([{...item,enabled:false}],'win32'),{});
});

test('reviewed commands run on their selected host without a Windows-only field on Unix',()=>{
 for(const platform of ['linux','darwin']){
  assert.deepEqual(api.nativeHooks([item],platform),{UserPromptSubmit:[{hooks:[{type:'command',command:'echo checked',timeout:3}]}]});
  assert.deepEqual(api.nativeHooks([{...item,enabled:false}],platform),{});
 }
});

test('native hook projection requires an explicit supported desktop platform',()=>{
 for(const platform of [undefined,null,'windows','android'])assert.throws(()=>api.nativeHooks([item],platform),/platform/i);
});

test('project hook review binds native serialization to the actual host platform',async t=>{
 const base=await mkdtemp(path.join(tmpdir(),'muse-hooks-platform-')),project=path.join(base,'project');await mkdir(project);t.after(()=>rm(base,{recursive:true,force:true}));
 for(const platform of ['win32','linux','darwin']){
  const review=createExtensionReview({dataDir:path.join(base,platform),profile:base,platform});
  await review.saveHooks(project,(await review.hookState(project)).revision,[item]);
  const hook=(await review.nativeHooks(project)).UserPromptSubmit[0].hooks[0];
  assert.equal(hook[platform==='win32'?'commandWindows':'command'],item.command);
  assert.equal(Object.hasOwn(hook,platform==='win32'?'command':'commandWindows'),false);
 }
});
test('hook review is scoped to canonical project and rejects stale settings',async t=>{
 const base=await mkdtemp(path.join(tmpdir(),'muse-hooks-')),a=path.join(base,'a'),b=path.join(base,'b');await mkdir(a);await mkdir(b);t.after(()=>rm(base,{recursive:true,force:true}));const options={dataDir:path.join(base,'data'),profile:base},review=createExtensionReview(options);
 assert.equal(typeof review.hookState,'function');const before=await review.hookState(a);await review.saveHooks(a,before.revision,[item]);assert.deepEqual((await createExtensionReview(options).hookState(a)).items,[item]);assert.deepEqual(await review.nativeHooks(b),{});assert.deepEqual(await review.nativeHooks(a),api.nativeHooks([item],process.platform));
 await assert.rejects(review.saveHooks(a,before.revision,[]),/changed/);await review.saveHooks(a,(await review.hookState(a)).revision,[]);assert.deepEqual(await review.nativeHooks(a),{});
});
