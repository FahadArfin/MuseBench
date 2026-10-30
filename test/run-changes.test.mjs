import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createRunChangeStore as rawStore} from '../src/controller/run-changes.mjs';
import {validateRunReview,validateRunFeedback,appendReviewFeedback} from '../src/shared/run-changes.mjs';
// All ordinary fixtures are rooted at /project; root-boundary tests override it.
const createRunChangeStore=db=>{const store=rawStore(db);return{...store,read:(task,run,files,root='/project')=>store.read(task,run,files,root),finish:(task,run,snapshot,root='/project')=>store.finish(task,run,snapshot,root),review:(input,files,root='/project')=>store.review(input,files,root),feedback:(input,files,root='/project')=>store.feedback(input,files,root)};};
const hash=value=>createHash('sha256').update(value).digest('hex');
const file=(text,binary=false)=>({text,hash:hash(text),binary});
const snap=files=>({revision:hash(JSON.stringify(files)),files});
function setup(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());const store=createRunChangeStore(db);return{db,store};}
const begin=(store,files={},runId='run',taskId='chat')=>store.begin({taskId,runId,root:'/project',snapshot:snap(files)});
test('capture binds changed, added and deleted files to an exact run without exposing its baseline',t=>{
 const {store}=setup(t),before={'a.js':file('one\ntwo\n'),'gone.js':file('old'),'same.js':file('same')},after={'a.js':file('one\nnew\n'),'new.js':file('new'),'same.js':file('same')};begin(store,before);store.finish('chat','run',snap(after));const view=store.read('chat','run',after);
 assert.equal(view.status,'complete');assert.deepEqual(view.files.map(f=>[f.path,f.status]),[['a.js','modified'],['gone.js','deleted'],['new.js','added']]);assert.equal(view.files[0].before,'one\ntwo\n');assert.equal(view.files[0].after,'one\nnew\n');assert.equal(view.files[0].stale,false);assert.equal(view.baseline,undefined);assert.equal(view.root,undefined);assert.equal(view.runId,'run');assert.equal(store.read('other','run',after).status,'unavailable');
});
test('review markers persist, reject stale revisions and invalidate when current content changes',t=>{
 const {db,store}=setup(t),after={'a.js':file('after')};begin(store,{'a.js':file('before')});store.finish('chat','run',snap(after));const view=store.read('chat','run',after),request={type:'setRunFileReviewed',taskId:'chat',runId:'run',revision:view.revision,path:'a.js',reviewed:true};
 store.review(request,after);assert.equal(createRunChangeStore(db).read('chat','run',after).files[0].reviewed,true);assert.throws(()=>store.review({...request,revision:'b'.repeat(64)},after),/changed|refresh/i);
 assert.equal(store.read('chat','run',{'a.js':file('outside edit')}).files[0].reviewed,false);assert.equal(store.read('chat','run',after).files[0].reviewed,false);assert.throws(()=>store.review(request,{'a.js':file('outside edit')}),/changed|refresh/i);
});
test('feedback validates captured side and line range, binds exact source, and only appends to a bounded draft',t=>{
 const {store}=setup(t),after={'a.js':file('first\nsecond\n')};begin(store,{'a.js':file('old')});store.finish('chat','run',snap(after));const view=store.read('chat','run',after),request={taskId:'chat',runId:'run',revision:view.revision,path:'a.js',side:'after',start:2,end:2,note:'Use a clearer name.'};
 const result=store.feedback(validateRunFeedback(request),after);assert.match(result.text,/a.js/);assert.match(result.text,/after lines 2/);assert.match(result.text,/run/);assert.match(result.text,/Use a clearer name/);assert.match(appendReviewFeedback('Existing draft',result.text),/^Existing draft\n\n/);
 assert.throws(()=>store.feedback({...request,end:99},after),/line/i);assert.throws(()=>store.feedback({...request,path:'missing'},after),/file/i);assert.throws(()=>store.feedback(request,{}),/changed/i);assert.throws(()=>appendReviewFeedback('x'.repeat(15990),result.text),/16,000/);
});
test('bounds and binary content are explicit and do not invent a text diff',t=>{
 const {store}=setup(t),before={},after={};for(let i=0;i<105;i++)after[`file${String(i).padStart(3,'0')}`]=file('x'.repeat(130*1024));after.file000=file('binary\0',true);begin(store,before);store.finish('chat','run',snap(after));const view=store.read('chat','run',after);
 assert.equal(view.files.length,100);assert.equal(view.omittedFiles,5);assert.equal(view.files[0].binary,true);assert.equal(view.files[1].omitted,true);assert.equal(view.files[1].after,'');assert.ok(JSON.stringify(view).length<200000);
 assert.throws(()=>store.feedback({taskId:'chat',runId:'run',revision:view.revision,path:'file000',side:'after',start:1,end:1,note:'comment'},after),/captured text/i);
});
test('pending captures become unavailable on restart and never adopt later unrelated edits',t=>{
 const {db,store}=setup(t);begin(store,{'a':file('before')});const restored=createRunChangeStore(db);assert.equal(restored.read('chat','run',{}).status,'unavailable');restored.finish('chat','run',snap({'a':file('unrelated')}));assert.equal(restored.read('chat','run',{}).status,'unavailable');assert.equal(restored.read('chat','run',{}).files.length,0);
});
test('retention is bounded per chat and globally, and deleting a chat removes only its captures',t=>{
 const {store,db}=setup(t);for(let i=0;i<25;i++){begin(store,{},`run${i}`);store.finish('chat',`run${i}`,snap({}));}assert.equal(db.prepare('SELECT COUNT(*) n FROM run_changes WHERE task_id=?').get('chat').n,20);
 for(let i=0;i<110;i++)begin(store,{},`r${i}`,`c${i}`);assert.equal(db.prepare('SELECT COUNT(*) n FROM run_changes').get().n,100);store.deleteTask('c109');assert.equal(store.read('c109','r109',{}).status,'unavailable');assert.equal(store.read('c108','r108',{}).status,'pending');
});
test('no changes and uncertain captures remain distinguishable',t=>{
 const {store}=setup(t),files={'a':file('same')};begin(store,files);store.finish('chat','run',snap(files));assert.equal(store.read('chat','run',files).status,'complete');assert.deepEqual(store.read('chat','run',files).files,[]);store.unavailable('chat','run','The run resumed.');assert.equal(store.read('chat','run',files).status,'unavailable');assert.deepEqual(store.read('chat','run',files).files,[]);
});
test('review and feedback contracts reject unknown fields, forged identities and invalid ranges',()=>{
 const base={type:'setRunFileReviewed',taskId:'t',runId:'r',revision:'a'.repeat(64),path:'a',reviewed:true};assert.equal(validateRunReview(base).reviewed,true);
 for(const patch of [{command:'do not run'},{reviewed:'true'},{taskId:''},{revision:'stale'},{path:'../outside'}])assert.throws(()=>validateRunReview({...base,...patch}));
 const feedback={taskId:'t',runId:'r',revision:base.revision,path:'a',side:'after',start:1,end:1,note:'yes'};for(const patch of [{start:0},{side:'current'},{end:0},{note:''},{note:'x'.repeat(4001)},{send:true}])assert.throws(()=>validateRunFeedback({...feedback,...patch}));
});
test('completed and pending captures retain their original canonical root privately',t=>{
 const {store}=setup(t),after={'a':file('after')};begin(store,{'a':file('before')});store.finish('chat','run',snap(after),'/project');let view=store.read('chat','run',after,'/project');const request={type:'setRunFileReviewed',taskId:'chat',runId:'run',revision:view.revision,path:'a',reviewed:true};store.review(request,after,'/project');
 view=store.read('chat','run',after,'/other');assert.equal(view.status,'unavailable');assert.match(view.reason,/project|folder/i);assert.equal(view.root,undefined);assert.deepEqual(view.files,[]);assert.throws(()=>store.review(request,after,'/other'),/project|folder|changed/i);assert.throws(()=>store.feedback({...request,type:undefined,side:'after',start:1,end:1,note:'Wrong project'},after,'/other'),/project|folder|changed/i);
 begin(store,{'a':file('before')},'pending');store.finish('chat','pending',snap(after),'/other');assert.equal(store.read('chat','pending',after,'/project').status,'unavailable');
});
test('feedback line numbers match the diff for empty, newline-terminated and unterminated source',t=>{
 const {store}=setup(t),after={'a':file('after\n'),'b':file('one\ntwo')};begin(store,{'a':file(''),'b':file('before')});store.finish('chat','run',snap(after));const view=store.read('chat','run',after),request={taskId:'chat',runId:'run',revision:view.revision,path:'a',side:'after',start:1,end:1,note:'Valid line'};
 assert.match(store.feedback(request,after).text,/after lines 1/);assert.throws(()=>store.feedback({...request,start:2,end:2},after),/line/i);assert.throws(()=>store.feedback({...request,side:'before'},after),/line/i);assert.match(store.feedback({...request,path:'b',start:2,end:2},after).text,/after lines 2/);assert.throws(()=>store.feedback({...request,path:'b',end:3},after),/line/i);
});
