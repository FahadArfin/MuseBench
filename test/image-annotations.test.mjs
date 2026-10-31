import test from 'node:test';
import assert from 'node:assert/strict';
import {imageReferences} from '../src/shared/code-images.mjs';
import {composeChatContext} from '../src/shared/chat-context.mjs';
const source={id:'a'.repeat(64),name:'original.png',mime:'image/png',bytes:80};
const image={...source,id:'b'.repeat(64),annotation:{source,marks:[{kind:'comment',x:.25,y:.75,text:'Move this button'},{kind:'arrow',color:'#ef4444',points:[{x:.1,y:.2},{x:.25,y:.75}]}]}};
test('image references preserve isolated editable source and normalized annotation metadata',()=>{
 const [saved]=imageReferences([image]);assert.deepEqual(saved,image);saved.annotation.marks[0].text='Changed';assert.equal(image.annotation.marks[0].text,'Move this button');
});
test('annotation boundaries reject invalid coordinates, text, drawings and recursive sources',()=>{
 for(const marks of [[{kind:'comment',x:2,y:.5,text:'bad'}],[{kind:'comment',x:0,y:0,text:' '}],[{kind:'comment',x:0,y:0,text:'x'.repeat(1001)}],[{kind:'pen',color:'url(unsafe)',points:[{x:0,y:0},{x:1,y:1}]}],Array(41).fill(image.annotation.marks[0])])assert.throws(()=>imageReferences([{...image,annotation:{source,marks}}]),/annotation/i);
 assert.throws(()=>imageReferences([{...image,annotation:{source:image,marks:image.annotation.marks}}]),/annotation/i);
});
test('current and replayed requests include numbered comments with image-relative coordinates',()=>{
 const current=composeChatContext({text:'Apply these changes',images:[image]}).prompt;assert.match(current,/Move this button/);assert.match(current,/25.*75/);
 const replay=composeChatContext({text:'Continue',task:{messages:[{id:'m',role:'user',text:'Apply these changes',images:[image]}]}}).prompt;assert.match(replay,/Move this button/);
});
