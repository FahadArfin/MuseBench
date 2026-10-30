import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createController} from '../src/controller/index.mjs';

async function fixture(t){const root=await mkdtemp(path.join(tmpdir(),'muse-import-controller-')),dataDir=path.join(root,'data'),project=path.join(root,'project'),file=path.join(root,'export.json'),controllers=[];await mkdir(project);await writeFile(path.join(project,'index.html'),'Original project');await writeFile(file,JSON.stringify([{name:'Imported research',chat_messages:[{sender:'human',text:'special cobalt research'},{sender:'assistant',text:'A source answer'}]}]));const open=async()=>{const controller=await createController({dataDir});controllers.push(controller);return controller;};t.after(async()=>{for(const c of controllers)await c.close();await rm(root,{recursive:true,force:true,maxRetries:5});});return{root,file,project,open,c:await open()};}
test('imports enter library history without creating native chats, changing drafts or admitting source paths from the command',async t=>{
 const {c,file,project,open}=await fixture(t);await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',request:'Keep my live chat',mode:'manual'});const state=c.getState(),binding={projectId:state.activeProject.id,taskId:state.task.id};await c.saveCodeDraft({...binding,text:'Keep my draft',files:[],images:[],mode:'plan'});const before=c.getState();
 await assert.rejects(c.conversationImport({type:'prepare',path:file}),/command/i);const pending=c.prepareConversationImport(file);assert.equal(c.canRestartForUpdate(),false);assert.ok(c.getUpdateBlockers().some(b=>/import/i.test(b.label)));const preview=await pending;assert.equal(c.canRestartForUpdate(),true);
 const saved=await c.conversationImport({type:'confirm',token:preview.token,ids:[preview.conversations[0].id]});assert.equal(saved.imported,1);const results=c.searchChats({query:'cobalt'});assert.equal(results.length,1);const imported=results[0];assert.equal(imported.imported.format,'Claude');assert.equal(c.readChatHistory({taskId:imported.id}).coverage,'imported');assert.deepEqual(c.getState(),before);
 const invalid=await c.dispatch({type:'selectTask',id:imported.id});assert.ok(invalid.error);assert.equal(invalid.task.id,binding.taskId);await assert.rejects(c.saveCodeDraft({...binding,taskId:imported.id,text:'No',files:[],mode:'chat'}),/unavailable/i);
 await c.close();const next=await open();assert.equal(next.getState().tasks.length,1);assert.equal(next.getState().task.id,binding.taskId);assert.equal(next.getState().drafts[`${binding.projectId}:${binding.taskId}`].text,'Keep my draft');assert.equal(next.searchChats({query:'cobalt'})[0].id,imported.id);await next.conversationImport({type:'remove',id:imported.id});assert.equal(next.searchChats({query:'cobalt'}).length,0);
});
test('controller shutdown cancels an off-thread preview without touching durable history',async t=>{
 const {c,file}=await fixture(t);const pending=c.prepareConversationImport(file),rejected=assert.rejects(pending,/closed/i);await c.close();await rejected;await assert.rejects(c.prepareConversationImport(file),/closed/i);
});
