import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
const source=await readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8');
function fixture(){const ipc=new EventEmitter(),calls=[],nativeFiles=new WeakMap();let bridge;ipc.invoke=async(channel,payload)=>{calls.push({channel,payload});return{assets:[{id:'asset'}],itemId:payload.itemId};};ipc.sendSync=()=>false;
 vm.runInNewContext(source,{require:id=>{assert.equal(id,'electron');return{ipcRenderer:ipc,webUtils:{getPathForFile:file=>{if(!file||typeof file!=='object'||!nativeFiles.has(file))throw Error('not a native File');return nativeFiles.get(file);}},contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}}};},process:{argv:[],platform:'win32'}});
 return{bridge,calls,file:(nativePath,properties={})=>{const file={name:'image.png',...properties};nativeFiles.set(file,nativePath);return file;}};
}
test('drop bridge sends only native File paths and captures its explicit item',async()=>{
 const f=fixture(),first=f.file('C:\\Users\\example\\photo.png',{path:'C:\\untrusted\\spoof.png'}),second=f.file('C:\\Users\\example\\clip.mp4');assert.equal(typeof f.bridge.importWorkFiles,'function');
 const result=await f.bridge.importWorkFiles('item-a',[first,second]);assert.equal(result.itemId,'item-a');assert.equal(f.calls.length,1);assert.equal(f.calls[0].channel,'musebench:work-import-files');assert.equal(f.calls[0].payload.itemId,'item-a');assert.deepEqual(Array.from(f.calls[0].payload.paths),['C:\\Users\\example\\photo.png','C:\\Users\\example\\clip.mp4']);assert.equal(Object.keys(f.calls[0].payload).length,2);
});
test('constructed File, forged path property and renderer path strings cannot become native imports',async()=>{
 const f=fixture();for(const files of [[f.file('')],[{name:'fake.png',path:'C:\\secret.png'}],['C:\\secret.png'],[null]])await assert.rejects(()=>f.bridge.importWorkFiles('item-a',files),/disk|native|drop|file/i);assert.equal(f.calls.length,0);
});
test('invalid item and unbounded/non-array drop payloads fail before IPC',async()=>{
 const f=fixture(),file=f.file('C:\\photo.png');for(const [itemId,files]of [['../other',[file]],['item',[]],['item',Array(33).fill(file)],['item',{0:file,length:1}],['item',[f.file('C:\\photo\u0000.png')]]])await assert.rejects(()=>f.bridge.importWorkFiles(itemId,files));assert.equal(f.calls.length,0);
});
test('renderer-controlled array methods cannot bypass native File provenance',async()=>{
 const f=fixture(),files=[{name:'forged.png',path:'C:\\secret.png'}];files.map=()=>['C:\\secret.png'];await assert.rejects(()=>f.bridge.importWorkFiles('item',files));assert.equal(f.calls.length,0);
});
