import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRunChangeStore} from '../src/controller/run-changes.mjs';
import {createSourceSnapshots} from '../src/controller/source-snapshots.mjs';
import {createFileReviewPager,describeReviewFiles} from '../src/controller/file-review.mjs';
import {validateFileReviewInspection,validateFileReviewRead} from '../src/shared/file-review.mjs';

async function fixture(t){const base=await mkdtemp(path.join(tmpdir(),'muse-file-review-')),root=path.join(base,'project');await mkdir(root);const content=createSourceSnapshots({directory:path.join(base,'objects')}),pager=createFileReviewPager({content,directory:path.join(base,'reviews')}),db=new DatabaseSync(':memory:'),runs=createRunChangeStore(db);t.after(async()=>{await pager.close();await content.close();db.close();await rm(base,{recursive:true,force:true,maxRetries:4});});return{base,root,content,pager,runs,db};}
test('full captured manifests preserve every changed file and immutable history beyond inline budgets',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'large.txt'),'before\n'.repeat(40000));const before=await f.content.snapshot(f.root);f.runs.begin({taskId:'t',runId:'r',root:f.root,snapshot:before});for(let i=0;i<105;i++)await writeFile(path.join(f.root,`file-${i}.txt`),'new');await writeFile(path.join(f.root,'large.txt'),'after\n'.repeat(40000));const after=await f.content.snapshot(f.root);f.runs.finish('t','r',after,f.root);
 const saved=f.runs.capture('t','r',f.root);assert.equal(saved.files.length,106);assert.equal(saved.beforeFiles['large.txt'].object,before.files['large.txt'].object);assert.equal(saved.afterFiles['large.txt'].object,after.files['large.txt'].object);assert.equal(describeReviewFiles({before:saved.beforeFiles,after:saved.afterFiles,changedOnly:true}).length,106);
 await writeFile(path.join(f.root,'large.txt'),'unrelated current content');assert.equal((await f.content.text(f.runs.capture('t','r',f.root).afterFiles['large.txt'],1024*1024)).startsWith('after'),true);assert.equal(f.runs.capture('foreign','r',f.root),null);assert.equal(f.runs.capture('t','r','foreign'),null);
});
test('paged comparison reaches changes after 2MiB and keeps every oversized line fragment',async t=>{
 const f=await fixture(t),prefix='unchanged line\n'.repeat(165000),long='x'.repeat(2*1024*1024+700);await writeFile(path.join(f.root,'a'),prefix+'old\n'+long);const left=(await f.content.snapshot(f.root)).files.a;await writeFile(path.join(f.root,'a'),prefix+'new\n'+long+'end');const right=(await f.content.snapshot(f.root)).files.a;let cursor,all=[],page;
 do{page=await f.pager.read({left,right,path:'a',revision:'a'.repeat(64),cursor,limit:17});assert.equal(page.status,'complete',page.reason);assert.ok(JSON.stringify(page).length<300000);all.push(...page.rows);cursor=page.nextCursor;}while(cursor);
 assert.ok(all.some(row=>row.kind==='removed'&&row.text==='old'));assert.ok(all.some(row=>row.kind==='added'&&row.text==='new'));assert.ok(all.some(row=>row.oldLine===165001));assert.equal(all.filter(row=>row.kind==='added'&&row.newLine===165002).map(row=>row.text).join(''),long+'end');assert.equal(page.additions,2);assert.equal(page.deletions,2);assert.ok(all.some(row=>row.continued&&row.ending&&row.noNewline));assert.equal(all.length,page.totalRows);
});
test('review requests reject forged identities, traversal, arbitrary hashes and cursor numbers',()=>{
 assert.deepEqual(validateFileReviewInspection({taskId:'t',scope:'all'}),{taskId:'t',scope:'all'});const read={taskId:'t',scope:'run',runId:'r',path:'a',revision:'a'.repeat(64)};assert.equal(validateFileReviewRead(read).path,'a');for(const patch of [{path:'../outside'},{path:'a\\b'},{afterHash:'b'.repeat(64)},{cursor:3},{scope:'elsewhere'},{revision:'stale'}])assert.throws(()=>validateFileReviewRead({...read,...patch}));
});

test('legacy omitted captures stay unavailable and never acquire present-day text',async t=>{
 const f=await fixture(t),hash='a'.repeat(64);f.db.prepare('INSERT INTO run_changes(task_id,run_id,json) VALUES(?,?,?)').run('t','old',JSON.stringify({taskId:'t',runId:'old',root:f.root,status:'complete',revision:hash,files:[{path:'lost.txt',status:'modified',beforeHash:hash,afterHash:'b'.repeat(64),before:'',after:'',binary:false,omitted:true}]}));const saved=f.runs.capture('t','old',f.root),files=describeReviewFiles({before:saved.beforeFiles,after:saved.afterFiles});assert.equal(files[0].available,false);const result=await f.pager.read({left:saved.beforeFiles['lost.txt'],right:saved.afterFiles['lost.txt'],path:'lost.txt',revision:hash});assert.equal(result.status,'unavailable');assert.equal(result.rows.length,0);
});

test('retained historical manifests protect CAS objects across cache expiry and collection',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'historical before');const before=await f.content.snapshot(f.root);f.runs.begin({taskId:'t',runId:'r',root:f.root,snapshot:before});await writeFile(path.join(f.root,'a'),'historical after');const after=await f.content.snapshot(f.root);f.runs.finish('t','r',after,f.root);await f.content.close();let time=Date.now()+100000;const storage=createSourceSnapshots({directory:path.join(f.base,'objects'),gc:{graceMs:1,now:()=>time}});t.after(()=>storage.close());const saved=f.runs.capture('t','r',f.root),result=await storage.collect({references:()=>({complete:true,revision:1,manifests:[saved.beforeFiles,saved.afterFiles]}),maxDurationMs:1000});assert.equal(result.deleted,0);assert.equal(result.retained,2);assert.equal(await storage.text(saved.beforeFiles.a),'historical before');assert.equal(await storage.text(saved.afterFiles.a),'historical after');
});

test('file paging rejects cross-file cursors and exposes all unchanged lines',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'line\n'.repeat(500));const file=(await f.content.snapshot(f.root)).files.a,first=await f.pager.read({left:file,right:file,path:'a',revision:'a'.repeat(64),limit:10});assert.equal(first.rows.length,10);assert.equal(first.totalRows,500);assert.equal(first.additions,0);assert.ok(first.nextCursor);await assert.rejects(f.pager.read({left:file,right:file,path:'other',revision:'a'.repeat(64),cursor:first.nextCursor}),/page/i);const next=await f.pager.read({left:file,right:file,path:'a',revision:'a'.repeat(64),cursor:first.nextCursor,limit:10});assert.equal(next.rows[0].oldLine,11);
});

test('newline-only changes and CRLF text preserve final newline markers without inventing extra changed lines',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'same\n');let left=(await f.content.snapshot(f.root)).files.a;await writeFile(path.join(f.root,'a'),'same');let right=(await f.content.snapshot(f.root)).files.a,page=await f.pager.read({left,right,path:'a',revision:'a'.repeat(64)}),removed=page.rows.find(row=>row.kind==='removed'),added=page.rows.find(row=>row.kind==='added');assert.equal(removed.text,added.text);assert.equal(!!removed.noNewline,false);assert.equal(added.noNewline,true);assert.equal(page.additions,1);assert.equal(page.deletions,1);
 await writeFile(path.join(f.root,'a'),'before\r\nlast\r\n');left=(await f.content.snapshot(f.root)).files.a;await writeFile(path.join(f.root,'a'),'after\r\nlast\r\n');right=(await f.content.snapshot(f.root)).files.a;page=await f.pager.read({left,right,path:'a',revision:'b'.repeat(64)});assert.equal(page.rows.find(row=>row.kind==='added').text,'after\r');assert.ok(page.rows.every(row=>!row.noNewline));assert.equal(page.additions,1);assert.equal(page.deletions,1);
});

test('a transient preparation failure is evicted so the same immutable pair can be retried',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'before\n');const left=(await f.content.snapshot(f.root)).files.a;await writeFile(path.join(f.root,'a'),'after\n');const right=(await f.content.snapshot(f.root)).files.a;let copies=0;const pager=createFileReviewPager({directory:path.join(f.base,'retry-reviews'),content:{copy:async(...args)=>{if(++copies===1)throw Error('Transient copy fixture');return f.content.copy(...args);}}});try{const request={left,right,path:'a',revision:'a'.repeat(64)},failed=await pager.read(request);assert.equal(failed.status,'unavailable');assert.match(failed.reason,/Transient/);const retried=await pager.read(request);assert.equal(retried.status,'complete',retried.reason);assert.ok(retried.rows.some(row=>row.kind==='added'&&row.text==='after'));assert.equal(copies,3);}finally{await pager.close();}
});
