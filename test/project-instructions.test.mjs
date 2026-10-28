import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,unlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createCustomize} from '../electron/customize.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
const api=await import('../src/runtime/project-instructions.mjs').catch(()=>({}));

async function fixture(t){
 const base=await mkdtemp(path.join(process.platform==='win32'?path.parse(os.tmpdir()).root:os.tmpdir(),'musebench-instructions-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const put=async(name,text='')=>{const file=path.join(base,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);return file;};
 return{base,put};
}
test('project instruction inspection exposes a read-only observer',()=>assert.equal(typeof api.inspectProjectInstructions,'function'));
test('nearest Git boundary, first-file selection and deeper precedence match documented rules',async t=>{
 const f=await fixture(t);await f.put('AGENTS.md','outside');await f.put('repo/.git','gitdir: ../worktree');
 await f.put('repo/CLAUDE.md','outer');await f.put('repo/.agents/AGENTS.md','shadowed');
 await f.put('repo/app/AGENTS.md','hé🙂');await f.put('repo/app/CLAUDE.md','ignored');
 const result=await api.inspectProjectInstructions(path.join(f.base,'repo/app'));
 assert.equal(result.boundary.kind,'git');assert.equal(result.boundary.root,path.join(f.base,'repo'));
 assert.deepEqual(result.levels.map(level=>path.relative(f.base,level.root)),['repo',path.join('repo','app')]);
 assert.deepEqual(result.levels.map(level=>level.files.filter(file=>file.selected).map(file=>file.path)),[['CLAUDE.md'],['AGENTS.md']]);
 assert.equal(result.levels[0].files[1].shadowedBy,'CLAUDE.md');assert.equal(result.levels[1].files[1].shadowedBy,'AGENTS.md');
 assert.equal(result.selectedCount,2);assert.equal(result.selectedBytes,12);assert.equal(result.complete,true);
 assert.equal(result.levels[1].files[0].bytes,7);assert.equal(result.levels[1].files[0].text,'hé🙂');
 assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});
test('empty selected file still shadows alternatives and has a known zero byte cost',async t=>{
 const f=await fixture(t);await f.put('.git');await f.put('AGENTS.md');await f.put('CLAUDE.md','alternative');
 const result=await api.inspectProjectInstructions(f.base);assert.equal(result.selectedCount,1);assert.equal(result.selectedBytes,0);assert.equal(result.levels[0].files[1].selected,false);
});
test('an instruction-free repository has a complete empty observation',async t=>{
 const f=await fixture(t);await mkdir(path.join(f.base,'.git'));
 const result=await api.inspectProjectInstructions(f.base);assert.equal(result.selectedCount,0);assert.equal(result.selectedBytes,0);assert.equal(result.complete,true);assert.deepEqual(result.levels[0].files,[]);
});
test('unreadable winning candidate does not fall through to another filename',async t=>{
 const f=await fixture(t);await f.put('.git');await mkdir(path.join(f.base,'AGENTS.md'));await f.put('CLAUDE.md','fallback must stay shadowed');
 const result=await api.inspectProjectInstructions(f.base),files=result.levels[0].files;
 assert.equal(files[0].selected,true);assert.equal(files[0].text,undefined);assert.ok(files[0].issue);assert.equal(files[1].selected,false);
 assert.equal(result.selectedBytes,null);assert.equal(result.complete,false);
});
for(const [label,content] of [['oversized','x'.repeat(100001)],['binary',Buffer.from([65,0,66])],['invalid UTF-8',Buffer.from([0xc3,0x28])]])test(`${label} instruction content is withheld and costs stay unknown`,async t=>{
 const f=await fixture(t);await f.put('.git');await f.put('AGENTS.md',content);
 const result=await api.inspectProjectInstructions(f.base);assert.equal(result.selectedBytes,null);assert.equal(result.complete,false);assert.equal(result.levels[0].files[0].text,undefined);assert.ok(result.levels[0].files[0].issue);
});
test('candidate directory junctions are never followed',async t=>{
 const f=await fixture(t);await f.put('repo/.git');await f.put('outside/AGENTS.md','private outside text');await f.put('repo/.claude/CLAUDE.md','lower priority');
 await symlink(path.join(f.base,'outside'),path.join(f.base,'repo/.agents'),process.platform==='win32'?'junction':'dir');
 const result=await api.inspectProjectInstructions(path.join(f.base,'repo'));
 assert.equal(result.complete,false);assert.equal(result.selectedBytes,null);
 assert.equal(result.levels[0].files[0].path,'.agents/AGENTS.md');assert.equal(result.levels[0].files[0].text,undefined);
 assert.match(result.levels[0].files[0].issue,/link/i);assert.equal(JSON.stringify(result).includes('private outside text'),false);
 assert.equal(result.levels[0].files[1].selected,false);
});
test('aggregate observation budget bounds content returned from deep hierarchies',async t=>{
 const f=await fixture(t);await f.put('.git');let dir='';
 for(let i=0;i<6;i++){await f.put(path.join(dir,'AGENTS.md'),'x'.repeat(100000));dir=path.join(dir,'child');}
 const result=await api.inspectProjectInstructions(path.join(f.base,path.dirname(dir)));
 assert.equal(result.selectedCount,6);assert.equal(result.selectedBytes,null);assert.equal(result.complete,false);
 assert.equal(result.levels.flatMap(level=>level.files).reduce((sum,file)=>sum+(file.text?.length??0),0),500000);
});
test('bounded ancestor traversal identifies an incomplete chain rather than zero instructions',async t=>{
 const f=await fixture(t);const deep=path.join(f.base,...Array(34).fill('d'));await mkdir(deep,{recursive:true});
 const result=await api.inspectProjectInstructions(deep);assert.equal(result.boundary.kind,'limit');assert.equal(result.levels.length,32);assert.equal(result.selectedBytes,null);assert.equal(result.complete,false);
});
for(const change of ['content','precedence'])test(`inspection never labels a mismatched ${change} observation as reviewed`,async t=>{
 const f=await fixture(t);await f.put('.git');await f.put('AGENTS.md','Saved reviewed version');await f.put('CLAUDE.md','Alternative rules');
 const review=createExtensionReview({dataDir:path.join(f.base,'data'),profile:f.base}),saved=await review.projectState(f.base);
 await review.approveProject(f.base,saved.fingerprint);
 if(change==='content')await f.put('AGENTS.md','Unreviewed working copy');else await unlink(path.join(f.base,'AGENTS.md'));
 const service=createCustomize({getState:()=>({activeProject:{root:f.base}}),environment:{USERPROFILE:f.base},dataDir:path.join(f.base,'data'),review:{...review,projectState:async root=>{await f.put('AGENTS.md','Saved reviewed version');return review.projectState(root);}},run:async()=>{throw Error('No subprocess expected');}});
 try{const {projectInstructions:result}=await service.dispatch({type:'inspectProject'});assert.equal(result.trust.status,'unavailable');assert.match(result.trust.reason,/changed during inspection/i);assert.equal(await review.allowProject(f.base),true);}finally{await service.close();}
});
test('unchanged reviewed project reports its matching observation and edit requires review again',async t=>{
 const f=await fixture(t);await f.put('.git');await f.put('AGENTS.md','Reviewed text');
 const review=createExtensionReview({dataDir:path.join(f.base,'data'),profile:f.base}),saved=await review.projectState(f.base);await review.approveProject(f.base,saved.fingerprint);
 const service=createCustomize({getState:()=>({activeProject:{root:f.base}}),environment:{USERPROFILE:f.base},dataDir:path.join(f.base,'data'),review,run:async()=>{throw Error('No subprocess expected');}});
 try{const first=(await service.dispatch({type:'inspectProject'})).projectInstructions;assert.equal(first.trust.status,'reviewed');assert.equal(first.levels[0].files[0].text,'Reviewed text');await f.put('AGENTS.md','Updated text');assert.equal((await service.dispatch({type:'inspectProject'})).projectInstructions.trust.status,'required');}finally{await service.close();}
});
