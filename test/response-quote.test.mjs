import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {buildResponseQuote} from '../src/shared/response-quote.mjs';
const source={taskId:'chat-1',messageId:'reply-2',displayedText:'First line\nSecond line',sourceText:'**First line**\nSecond line'};
test('whole reply preserves displayed lines with stable source attribution',()=>{
 assert.equal(typeof buildResponseQuote,'function','response quote builder is available');
 assert.equal(buildResponseQuote(source),'Quoted assistant reply (chat chat-1; message reply-2):\n> First line\n> Second line');
});
test('selection captures exact spaces, blank lines and emoji instead of the full reply',()=>{
 assert.equal(buildResponseQuote({...source,selection:'  selected 👩🏽‍💻\n\nend  '}),'Quoted assistant reply (chat chat-1; message reply-2):\n>   selected 👩🏽‍💻\n> \n> end  ');
});
test('quote escapes Markdown and HTML syntax without allowing an unquoted line',()=>{
 assert.equal(buildResponseQuote({...source,selection:'> prior\n```js\n<a>[link](url) *bold* \\path\n```'}),'Quoted assistant reply (chat chat-1; message reply-2):\n> \\> prior\n> \\`\\`\\`js\n> \\<a\\>\\[link\\](url) \\*bold\\* \\\\path\n> \\`\\`\\`');
});
test('rejects a combined over-limit draft without truncating or altering existing text',()=>{
 const draft='x'.repeat(15990);assert.throws(()=>buildResponseQuote({...source,draftText:draft}),/16,000/);assert.equal(draft,'x'.repeat(15990));
 const block=buildResponseQuote(source),fit='x'.repeat(16000-block.length-2);assert.equal(buildResponseQuote({...source,draftText:fit}),block);assert.throws(()=>buildResponseQuote({...source,draftText:fit+'x'}),/16,000/);
});
test('rejects blank replies and invalid attribution rather than forging provenance',()=>{
 for(const patch of [{displayedText:''},{selection:''},{taskId:'bad\nsource'},{messageId:'x); injected'},{messageId:''}])assert.throws(()=>buildResponseQuote({...source,...patch}),/source|Select/);
});
test('ordinary quote text retains attribution through draft and explicit queue storage across controller restart',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-response-quote-'));let controller;let runtimeCalls=0;
 const runtime={snapshot:()=>({status:'unavailable',messages:[]}),subscribe:()=>()=>{},async disconnect(){},async connect(){runtimeCalls++;},async send(){runtimeCalls++;}};
 t.after(async()=>{await controller?.close();await rm(root,{recursive:true,force:true});});const project=path.join(root,'project'),dataDir=path.join(root,'profile');await mkdir(project);
 controller=await createController({dataDir,runtime});await controller.dispatch({type:'openProject',path:project});let state=await controller.dispatch({type:'newTask',mode:'muse',request:'Offline quote storage'});
 const owner={projectId:state.activeProject.id,taskId:state.task.id},text=buildResponseQuote({...source,taskId:owner.taskId,selection:'Exact 👩🏽‍💻 snapshot'}),draft={text,mode:'plan',files:[],images:[]};await controller.saveCodeDraft({...owner,...draft});await controller.close();
 controller=await createController({dataDir,runtime});assert.equal(controller.getState().drafts[`${owner.projectId}:${owner.taskId}`].text,text);
 state=await controller.dispatch({type:'queueMessage',text,files:[],images:[],mode:'plan'});assert.equal(state.error,null);assert.equal(state.task.promptQueue[0].text,text);await controller.close();
 controller=await createController({dataDir,runtime});const queued=controller.getState().task;assert.equal(queued.promptQueue[0].text,text);assert.equal(queued.promptQueue[0].mode,'plan');assert.equal(queued.queuePaused,true);assert.equal(runtimeCalls,0);
});
