import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/ui/file-preview/frame.ts'],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'controlled-renderer',setup(builder){builder.onResolve({filter:/^\.\/renderers$/},()=>({path:'renderer',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const renderFile=(...args)=>globalThis.testRender(...args);',loader:'js'}));}}]});
function fixture(render){
 const handlers=new Map(),sent=[],root={textContent:'',querySelectorAll:()=>[]},element=()=>({style:{},append(){},replaceChildren(){},addEventListener(){}}),parent={postMessage:value=>sent.push(value)};
 const context={AbortController,DOMException,location:{hash:'#owner'},parent,getSelection:()=>null,testRender:render,document:{getElementById:id=>id==='file-root'?root:element(),createElement:element,body:{append(){},classList:{toggle(){}}},addEventListener(){}},window:{addEventListener:(name,fn)=>handlers.set(name,fn)}};
 vm.runInNewContext(built.outputFiles[0].text,context);
 return{root,sent,send:value=>handlers.get('message')({source:parent,data:{nonce:'owner',...value}})};
}
test('old pagination cannot zoom or clear a replacement preview after its awaited page operation',async()=>{
 let release,secondZooms=0;const first={pages:2,setPage:()=>new Promise(resolve=>release=resolve),setZoom(){throw Error('Old zoom must never run');},destroy(){}};
 const second={pages:1,setPage(){},setZoom(){secondZooms++;},destroy(){}};
 const f=fixture(async(file,root)=>{root.textContent=file.name;return file.name==='first'?first:second;});
 await f.send({type:'render',file:{name:'first'}});const pending=f.send({type:'view',page:2,zoom:1.5});await f.send({type:'render',file:{name:'second'}});release();await pending;
 assert.equal(f.root.textContent,'second');assert.equal(secondZooms,0);assert.equal(f.sent.some(item=>item.type==='error'),false);
});
test('late errors from a superseded render cannot replace the current document',async()=>{
 let rejectFirst;const f=fixture(async(file,root)=>{if(file.name==='first')return new Promise((_,reject)=>rejectFirst=reject);root.textContent='second';return{pages:1,setPage(){},setZoom(){},destroy(){}};});
 const pending=f.send({type:'render',file:{name:'first'}});await f.send({type:'render',file:{name:'second'}});rejectFirst(Error('Old file failed'));await pending;
 assert.equal(f.root.textContent,'second');assert.equal(f.sent.some(item=>item.type==='error'),false);
});
