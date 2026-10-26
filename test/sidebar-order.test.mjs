import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {validateAction} from '../electron/security.mjs';
import {sidebarSort} from '../src/shared/sidebar-order.mjs';
async function fixture(){
 await mkdir('artifacts/sidebar-order-tests',{recursive:true});const root=await mkdtemp(path.resolve('artifacts/sidebar-order-tests/run-')),options={dataDir:path.join(root,'data')};
 const c=await createController(options),projects=[],chats=[];
 for(const name of ['Alpha','Beta']){const dir=path.join(root,name);await mkdir(dir);await writeFile(path.join(dir,'README.md'),name);let state=await c.dispatch({type:'openProject',path:dir});projects.push(state.activeProject);for(const title of [name+' one',name+' two']){state=await c.dispatch({type:'newTask',mode:'manual',request:title});chats.push(state.task);}}
 return {c,options,projects,chats};
}
const move=(id,section,extra={})=>({type:'moveSidebarItem',kind:'chat',id,section,...extra});
test('independent project, project-chat, pinned and recent ordering survives controller restart',async()=>{
 const {c,options,projects:[a,b],chats:[one,two,three]}=await fixture();let expected;
 try{
  assert.equal((await c.dispatch({type:'moveSidebarItem',kind:'project',id:b.id,section:'projects',beforeId:a.id})).error,null);
  await c.dispatch(move(one.id,'project',{projectId:a.id,beforeId:two.id}));
  await c.dispatch(move(one.id,'pinned'));await c.dispatch(move(three.id,'pinned',{beforeId:one.id}));
  const state=await c.dispatch(move(two.id,'recents'));assert.equal(state.error,null);
  assert.deepEqual(state.sidebarOrder.projects,[b.id,a.id]);assert.deepEqual(state.sidebarOrder.pinned,[three.id,one.id]);assert.deepEqual(state.sidebarOrder[`project:${a.id}`],[one.id,two.id]);
  assert(state.tasks.find(t=>t.id===one.id).pinned);expected=state.sidebarOrder;
 }finally{await c.close();}
 const next=await createController(options);try{assert.deepEqual(next.getState().sidebarOrder,expected);assert(next.getState().tasks.find(t=>t.id===one.id).pinned);}finally{await next.close();}
});
test('moving the selected chat changes its working folder and baseline, preserving messages, drafts, and source files',async()=>{
 const {c,options,projects:[a,b],chats}=await fixture();const chat=chats[3];let original;
 try{
  original=c.getState().task.messages;
  await c.dispatch({type:'saveDraft',projectId:b.id,taskId:chat.id,text:'Keep this draft',files:[],mode:'chat'});
  const state=await c.dispatch(move(chat.id,'project',{projectId:a.id}));assert.equal(state.error,null);assert.equal(state.activeProject.id,a.id);assert.equal(state.task.projectId,a.id);assert.deepEqual(state.task.messages.slice(0,original.length),original);assert.deepEqual(state.task.changes,[]);assert.equal(state.task.check,null);
  assert.equal(state.drafts[`${a.id}:${chat.id}`].text,'Keep this draft');assert.equal(state.drafts[`${b.id}:${chat.id}`],undefined);
  assert.equal(await readFile(path.join(a.root,'README.md'),'utf8'),'Alpha');assert.equal(await readFile(path.join(b.root,'README.md'),'utf8'),'Beta');
 }finally{await c.close();}
 const next=await createController(options);try{const state=await next.dispatch({type:'selectTask',id:chat.id});assert.equal(state.error,null);assert.equal(state.activeProject.id,a.id);assert.deepEqual(state.task.changes,[]);}finally{await next.close();}
});
test('nonselected transfers and pin/unpin keep the current conversation, and invalid moves do not mutate ordering',async()=>{
 const {c,projects:[a,b],chats:[one,,,selected]}=await fixture();try{
  let state=await c.dispatch(move(one.id,'project',{projectId:b.id}));assert.equal(state.error,null);assert.equal(state.task.id,selected.id);assert.equal(state.tasks.find(t=>t.id===one.id).projectId,b.id);
  state=await c.dispatch(move(one.id,'pinned'));assert(state.tasks.find(t=>t.id===one.id).pinned);
  state=await c.dispatch(move(one.id,'recents'));assert.equal(state.tasks.find(t=>t.id===one.id).pinned,false);
  const saved=state.sidebarOrder;
  for(const action of [move(one.id,'project',{projectId:'missing'}),move(one.id,'recents',{beforeId:'missing'}),move('missing','pinned')]){state=await c.dispatch(action);assert(state.error);assert.deepEqual(state.sidebarOrder,saved);}
  await c.dispatch({type:'setTaskFlags',id:one.id,archived:true});assert((await c.dispatch(move(one.id,'pinned'))).error);
 }finally{await c.close();}
});
test('cross-project moves reject pending source-file attachments without changing the chat',async()=>{
 const {c,projects:[a,b],chats}=await fixture();const chat=chats[3];try{
  const saved=await c.dispatch({type:'saveDraft',projectId:b.id,taskId:chat.id,text:'Use this',files:[{path:'README.md',hash:'a'.repeat(64)}],mode:'chat'});assert.equal(saved.error,null);
  const state=await c.dispatch(move(chat.id,'project',{projectId:a.id}));assert.match(state.error,/attachments/);assert.equal(state.task.projectId,b.id);assert.deepEqual(state.drafts,saved.drafts);
 }finally{await c.close();}
});
test('IPC rejects malformed moves and default sorting remains stable for old data',()=>{
 for(const action of [move('','pinned'),move('a','projects'),move('a','project'),move('a','recents',{beforeId:12}),{...move('a','pinned'),kind:'other'}])assert.throws(()=>validateAction(action));
 assert.doesNotThrow(()=>validateAction(move('a','pinned')));assert.deepEqual(sidebarSort([{id:'b'},{id:'a'}]).map(x=>x.id),['b','a']);
});
