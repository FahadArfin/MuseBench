import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBrowserAnnotations,browserAnnotationsText} from '../src/shared/browser-annotations.mjs';
import {composeChatContext,CONTEXT_LIMIT} from '../src/shared/chat-context.mjs';
import {editQueuedPrompt} from '../src/shared/queued-prompts.mjs';
import {validateAction} from '../electron/security.mjs';
const annotation=(patch={})=>({id:'a',page:'https://example.com/page?secret=hidden#part',target:{selector:'html > body > button',tag:'button',title:'Submit',text:'Untrusted page words',rect:{x:.1,y:.2,width:.3,height:.2},styles:{color:'rgb(1, 2, 3)'}},note:'Make this clearer',styleChanges:{fontSize:'18px'},...patch});
test('annotations normalize references, retain exact note, and use deterministic separated context',()=>{
 const values=validateBrowserAnnotations([annotation({note:'  Keep user spacing\nplease  '})]);
 assert.equal(values[0].page,'https://example.com/page');assert.equal(values[0].note,'  Keep user spacing\nplease  ');
 assert.deepEqual(validateBrowserAnnotations(values),values);assert.deepEqual(validateBrowserAnnotations(),[]);
 const encoded=browserAnnotationsText(values);assert.match(encoded,/untrusted/i);assert.match(encoded,/user-authored/i);assert.ok(encoded.indexOf('Untrusted page words')<encoded.indexOf('Keep user spacing'));
 assert.equal(encoded,browserAnnotationsText(structuredClone(values)));
});
test('annotation validation rejects malformed, executable, oversized, duplicate and credentialed references',()=>{
 for(const values of [[annotation({page:'javascript:alert(1)'})],[annotation({page:'https://user:secret@example.com'})],[annotation({note:'x'.repeat(4001)})],[annotation({styleChanges:{position:'fixed'}})],[annotation({styleChanges:{color:'url(https://example.com)'}})],[annotation(),annotation()],[annotation({extra:'script'})],Array.from({length:21},(_,i)=>annotation({id:String(i)})),Array.from({length:6},(_,i)=>annotation({id:String(i),note:'x'.repeat(4000)}))])assert.throws(()=>validateBrowserAnnotations(values));
});
test('current and historical annotations fit the prepared context limit and remain reference data',()=>{
 const annotations=validateBrowserAnnotations([annotation()]);
 const current=composeChatContext({text:'Apply these changes',annotations});assert.match(current.prompt,/Untrusted page words/);assert.ok(current.characters<=CONTEXT_LIMIT);
 const historical=composeChatContext({text:'Continue',task:{messages:[{id:'old',role:'user',text:'Earlier request',annotations}]}});assert.match(historical.prompt,/historicalBrowserAnnotations/);
 assert.throws(()=>composeChatContext({text:'x'.repeat(16000),attachments:[{path:'x',hash:'a',text:'x'.repeat(50000)}],annotations}),/large|limit/);
});
test('queue edits preserve, replace and remove the exact annotation bundle',()=>{
 const annotations=validateBrowserAnnotations([annotation()]),task={id:'task',promptQueue:[{id:'q',text:'Before',mode:'chat',annotations}]},action={taskId:'task',id:'q',expectedRevision:0,text:'After',mode:'chat'};
 assert.deepEqual(editQueuedPrompt(task,action).annotations,annotations);assert.deepEqual(editQueuedPrompt(task,{...action,annotations:[]}).annotations,[]);
 const changed=validateBrowserAnnotations([annotation({note:'Changed'})]);assert.deepEqual(editQueuedPrompt(task,{...action,annotations:changed}).annotations,changed);
});
test('workspace actions normalize annotations and allow only typed attachment payloads',()=>{
 const input={type:'sendMessage',text:'Apply',annotations:[annotation()]};assert.equal(validateAction(input).annotations[0].page,'https://example.com/page');
 assert.throws(()=>validateAction({...input,annotations:[annotation({styleChanges:{color:'expression(alert(1))'}})]}));
 assert.deepEqual(validateAction({type:'editQueued',taskId:'t',id:'q',expectedRevision:0,text:'Edit',mode:'chat',annotations:[]}).annotations,[]);
});
