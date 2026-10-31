import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chatLink,chatLinkTask,chatMarkdown} from '../src/shared/chat-menu-tools.mjs';
import {createChatMenuTools} from '../electron/chat-menu-tools.mjs';
test('local links round trip exact chat IDs and reject foreign URLs or extra data',()=>{
 assert.equal(chatLinkTask(chatLink('chat-123')),'chat-123');
 for(const value of ['https://example.com/chat/a','musebench://chat/../a','musebench://chat/a?run=bad','musebench://chat/a/b','musebench://other/a'])assert.equal(chatLinkTask(value),null);
});
test('Markdown exports user/assistant messages without duplicating the original prompt',()=>{
 const markdown=chatMarkdown({title:'Review',request:'Fix it'},[{role:'system',text:'private runtime note'},{role:'user',text:'Fix it'},{role:'assistant',text:'Done'}]);
 assert.equal((markdown.match(/Fix it/g)??[]).length,1);assert.match(markdown,/Done/);assert.doesNotMatch(markdown,/private runtime/);
 assert.doesNotMatch(chatMarkdown({title:'Fork',request:'Old request',requestOrigin:'history'},[{role:'user',text:'New request'}]),/Old request/);
});
test('native tools bind to the chat, keep reviewed share text fixed and launch separate path arguments',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-menu-'));try{
  const folder=path.join(root,'Project & notes');await mkdir(folder);let current={task:{id:'one',title:'Review',request:'Request'},activeProject:{id:'p',root:folder}},messages=[{id:'m',role:'assistant',text:'Original reply',textLength:14,offset:0}],copied='',launched;
  const output=path.join(root,'shared.md');const tools=createChatMenuTools({getState:()=>current,readHistory:async()=>({messages,before:null}),clipboard:{writeText:async text=>{copied=text;}},save:async()=>output,openPath:async()=>'',detect:async()=>[{id:'vscode',label:'VS Code',available:true,executable:'Code.exe'}],launch:async(exe,args,options)=>{launched={exe,args,options};}});
  await tools({taskId:'one',type:'copy',format:'directory'});assert.equal(copied,folder);
  const preview=await tools({taskId:'one',type:'preview'});messages=[{...messages[0],text:'New reply'}];await tools({taskId:'one',type:'share',token:preview.token});assert.match(await readFile(output,'utf8'),/Original reply/);assert.doesNotMatch(await readFile(output,'utf8'),/New reply/);
  await tools({taskId:'one',type:'open',app:'vscode'});assert.deepEqual(launched.args,[folder]);assert.equal(launched.options.cwd,folder);
  current={...current,task:{...current.task,id:'two'}};await assert.rejects(tools({taskId:'one',type:'copy',format:'markdown'}),/chat changed/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('transcript export preserves page order and fetches long messages without truncation',async()=>{
 const rows=Array.from({length:75},(_,index)=>({id:'m'+index,role:index%2?'assistant':'user',text:index===12?'LONG'.repeat(5000):'Message '+index}));
 let copied='';const tools=createChatMenuTools({getState:()=>({task:{id:'one',title:'History',request:'Initial',requestOrigin:'history'},activeProject:{root:'project'}}),clipboard:{writeText:text=>{copied=text;}},readHistory:async input=>{
  const end=input.before?rows.findIndex(row=>row.id===input.before):rows.length,selected=input.messageId?[rows.find(row=>row.id===input.messageId)]:rows.slice(Math.max(0,end-50),end);
  return{messages:selected.map(row=>({...row,text:row.text.slice(input.offset??0,(input.offset??0)+8000),textLength:row.text.length})),before:!input.messageId&&end>50?selected[0].id:null};
 }});await tools({taskId:'one',type:'copy',format:'markdown'});assert(copied.indexOf('Message 0')<copied.indexOf('Message 74'));assert.match(copied,new RegExp('LONG'.repeat(5000)));assert.equal((copied.match(/Message 74/g)??[]).length,1);
});
test('share cancellation and invalid/missing preview tokens do not write files',async()=>{
 const tools=createChatMenuTools({getState:()=>({task:{id:'one',title:'Test',request:'Request'},activeProject:{root:'project'}}),readHistory:async()=>({messages:[],before:null}),save:async()=>null});
 await assert.rejects(tools({taskId:'one',type:'share'}),/preview/);const view=await tools({taskId:'one',type:'preview'});assert.equal((await tools({taskId:'one',type:'share',token:view.token})).status,'cancelled');
 await assert.rejects(tools({taskId:'one',type:'open',app:'arbitrary',executable:'bad.exe'}),/Invalid/);
});
