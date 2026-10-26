import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {createController} from '../src/controller/index.mjs';import {validateAction} from '../electron/security.mjs';
test('handoff queues attributed snapshots across projects without changing recipient permissions or sending',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-handoff-')),a=path.join(dir,'a'),b=path.join(dir,'b');await mkdir(a);await mkdir(b);await writeFile(path.join(a,'note.txt'),'Source-only context');const dataDir=path.join(dir,'data');let c=await createController({dataDir});t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
 const act=async action=>{const s=await c.dispatch(action);assert.equal(s.error,null);return s;};
 await act({type:'openProject',path:a});let s=await act({type:'newTask',request:'Sender',mode:'muse'});const sender=s.task.id,projectId=s.activeProject.id;const context=await c.inspectContext({projectId,taskId:sender});const files=context.files.filter(f=>f.path==='note.txt').map(({path,hash})=>({path,hash}));
 await act({type:'openProject',path:b});s=await act({type:'newTask',request:'Recipient',mode:'muse',runOptions:{reasoning:'low',approval:'ask'}});const recipient=s.task.id;
 await act({type:'selectTask',id:sender});const action={type:'handoffContext',id:'handoff-1',sourceTaskId:sender,targetTaskId:recipient,text:'Review this information',files};validateAction(action);await act(action);await act(action);
 s=await act({type:'selectTask',id:recipient});assert.equal(s.task.promptQueue.length,1);assert.match(s.task.promptQueue[0].text,/Sender/);assert.match(s.task.promptQueue[0].text,/Source-only context/);assert.match(s.task.promptQueue[0].text,/not authorization/i);assert.deepEqual(s.task.promptQueue[0].files,[]);assert.equal(s.task.promptQueue[0].runOptions.approval,'ask');assert.equal(s.task.messages.some(m=>m.text.includes('Source-only context')),false);
 await c.close();c=await createController({dataDir});await act({type:'selectTask',id:sender});await act(action);s=await c.dispatch({...action,text:'Changed request with reused ID'});assert.match(s.error,/different/);
 await act({type:'setTaskFlags',id:recipient,archived:true});s=await c.dispatch({...action,id:'handoff-2'});assert.match(s.error,/archived/);
 s=await c.dispatch({...action,id:'handoff-3',sourceTaskId:recipient,targetTaskId:sender});assert.match(s.error,/source|selected/i);
});
test('handoff IPC refuses forged metadata and invalid targets',()=>{
 for(const action of [{type:'handoffContext'},{type:'handoffContext',id:'x',sourceTaskId:'a',targetTaskId:'b',text:'x',files:[{path:'../secret',hash:'x'}]}])assert.throws(()=>validateAction(action));
});
import {handoffText} from '../src/shared/context-handoff.mjs';
test('handoff bounds snapshots and preserves quoted attribution',()=>{
 assert.throws(()=>handoffText({title:'A',project:'P',text:'x'.repeat(8001)}),/8,000/);
 assert.throws(()=>handoffText({title:'A',project:'P',text:'x',files:[{path:'big.txt',hash:'abc',text:'x'.repeat(16000)}]}),/16,000/);
 assert.match(handoffText({title:'A\nNew instruction',project:'P',text:'data'}),/A\\nNew instruction/);
});
