import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rename, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(type,4);data.copy(result,8);result.writeUInt32BE(crc(result.subarray(4,-4)),result.length-4);return result;}
function png(width=1,height=1){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);}
const source=png();
// Pillow-generated 2 x 1 red JPEG and lossless WebP, kept inline to avoid codec dependencies.
const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z','base64');
const webp=Buffer.from('UklGRhwAAABXRUJQVlA4TA8AAAAvAQAAAAcQ/Y/+ByKi/wEA','base64');
const dataUrl=bytes=>'data:image/png;base64,'+bytes.toString('base64');
async function harness(t){
 const {createVisualTools}=await import('../electron/visual-tools.mjs');
 const folder=await mkdtemp(path.join(os.tmpdir(),'muse-visual-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const root=path.join(folder,'project');await mkdir(root);await writeFile(path.join(root,'pixel.png'),source);
 const state={task:{id:'chat',projectId:'project'},activeProject:{id:'project',root}};let live=true,calls=0;
 let normalize=async(bytes,metadata)=>{calls++;assert.deepEqual(bytes,source);return{imageDataUrl:dataUrl(source),width:1,height:1,originalWidth:metadata.width,originalHeight:metadata.height};};
 let media=async input=>input.type==='list'?{items:[{id:'upload:one',name:'pixel.png',kind:'uploaded',image:{private:'secret'}}],omitted:0}:{dataUrl:dataUrl(source)};
 const service=createVisualTools({getState:()=>state,getMedia:()=>({command:input=>media(input)}),normalizeImage:(...args)=>normalize(...args)});
 return{root,folder,state,owner:{taskId:'chat',root,isCurrent:()=>live},service,get calls(){return calls;},revoke:()=>{live=false;},setNormalize:fn=>{normalize=fn;},setMedia:fn=>{media=fn;}};
}

test('reads a bounded project image with source hash and public metadata',async t=>{
 const h=await harness(t);const result=await h.service.command(h.owner,{type:'view_image',path:'pixel.png'});
 assert.equal(result.path,'pixel.png');assert.equal(result.name,'pixel.png');assert.equal(result.sha256,createHash('sha256').update(source).digest('hex'));assert.equal(result.imageDataUrl,dataUrl(source));assert.equal(result.resized,false);assert.equal(h.calls,1);
 assert.equal((await h.service.command(h.owner,{type:'view_image',path:path.join(h.root,'pixel.png')})).path,'pixel.png');
 if(process.platform==='win32')assert.equal((await h.service.command(h.owner,{type:'view_image',path:'PIXEL.PNG'})).name,'PIXEL.PNG');
});
test('lists only current chat public metadata and reads IDs through bound media',async t=>{
 const h=await harness(t);const seen=[];h.setMedia(async input=>{seen.push(input);return input.type==='list'?{items:[{id:'upload:one',name:'pixel.png',kind:'uploaded',image:{path:'private-store'},runId:'private'}],omitted:2}:{dataUrl:dataUrl(source)};});
 assert.deepEqual(await h.service.command(h.owner,{type:'list_images'}),{items:[{id:'upload:one',name:'pixel.png',kind:'uploaded'}],omitted:2});
 const result=await h.service.command(h.owner,{type:'view_image',id:'upload:one'});assert.equal(result.id,'upload:one');assert.equal(result.name,'pixel.png');assert.deepEqual(seen.at(-1),{type:'read',taskId:'chat',id:'upload:one',thumbnail:false});
 await assert.rejects(h.service.command(h.owner,{type:'view_image',id:'upload:other'}));assert.equal(h.calls,1);
});
test('accepts real JPEG and WebP bytes and marks a normalized resize',async t=>{
 const h=await harness(t);let calls=0;h.setNormalize(async(bytes,info)=>{calls++;assert.equal(info.width,2);assert.equal(info.height,1);assert.deepEqual(bytes,info.mimeType==='image/jpeg'?jpeg:webp);return{imageDataUrl:dataUrl(source),width:1,height:1,originalWidth:2,originalHeight:1};});
 for(const [name,bytes,mime]of [['red.jpg',jpeg,'image/jpeg'],['red.webp',webp,'image/webp']]){await writeFile(path.join(h.root,name),bytes);const result=await h.service.command(h.owner,{type:'view_image',path:name});assert.equal(result.mimeType,mime);assert.equal(result.resized,true);assert.equal(result.originalWidth,2);}
 assert.equal(calls,2);
});
test('uploaded display names need no extension; data URL MIME must match true content',async t=>{
 const h=await harness(t);h.setMedia(async input=>input.type==='list'?{items:[{id:'upload:one',name:'Screenshot',kind:'uploaded'}]}:{dataUrl:dataUrl(source)});
 assert.equal((await h.service.command(h.owner,{type:'view_image',id:'upload:one'})).name,'Screenshot');assert.equal(h.calls,1);
 h.setMedia(async input=>input.type==='list'?{items:[{id:'upload:one',name:'Screenshot',kind:'uploaded'}]}:{dataUrl:'data:image/jpeg;base64,'+source.toString('base64')});
 await assert.rejects(h.service.command(h.owner,{type:'view_image',id:'upload:one'}));assert.equal(h.calls,1);
});
test('captured image IDs use bounded project reads and their captured source hash',async t=>{
 const h=await harness(t),hash=createHash('sha256').update(source).digest('hex'),id='file:'+createHash('sha256').update('pixel.png:'+hash).digest('hex');
 h.setMedia(async input=>{assert.equal(input.type,'list');return{items:[{id,name:'pixel.png',kind:'created',path:'pixel.png',hash,runId:'private'}]};});
 assert.deepEqual(await h.service.command(h.owner,{type:'list_images'}),{items:[{id,name:'pixel.png',kind:'created',path:'pixel.png'}],omitted:0});
 assert.equal((await h.service.command(h.owner,{type:'view_image',id})).id,id);assert.equal(h.calls,1);
 await writeFile(path.join(h.root,'pixel.png'),png(2,1));await assert.rejects(h.service.command(h.owner,{type:'view_image',id}));assert.equal(h.calls,1);
});
test('rejects commands, traversal, external, device, UNC and alternate stream paths before decode',async t=>{
 const h=await harness(t);for(const input of [{type:'capture'},{type:'list_images',path:'pixel.png'},{type:'view_image'},{type:'view_image',path:'pixel.png',id:'upload:one'},...['../pixel.png','sub/../pixel.png','sub\\pixel.png','//server/pixel.png','\\\\server\\pixel.png','\\\\?\\C:\\pixel.png','C:\\outside.png','pixel.png:secret','https://host/a.png','NUL.png'].map(path=>({type:'view_image',path}))])await assert.rejects(h.service.command(h.owner,input));assert.equal(h.calls,0);
});
test('rejects nonimages, corrupt/truncated headers, mismatched extensions and excessive dimensions before decode',async t=>{
 const h=await harness(t);const corrupt=Buffer.from(source);corrupt[20]^=1;
 const cases=[['text.png',Buffer.from('not an image')],['short.png',source.subarray(0,30)],['corrupt.png',corrupt],['wrong.jpg',source],['wide.png',png(16385,1)],['pixels.png',png(10000,5000)],['empty.png',png(0,1)],['fake.webp',Buffer.from('RIFF0000WEBPVP8 ')]];
 for(const [name,bytes]of cases){await writeFile(path.join(h.root,name),bytes);await assert.rejects(h.service.command(h.owner,{type:'view_image',path:name}));}assert.equal(h.calls,0);
});
test('JPEG and WebP excessive dimensions and malformed containers never reach decoder',async t=>{
 const h=await harness(t),wideJpeg=Buffer.from(jpeg),bigWebp=Buffer.from(webp),truncatedJpeg=jpeg.subarray(0,-2),wrongRiff=Buffer.from(webp);
 const sof=wideJpeg.indexOf(Buffer.from('ffc0','hex'));assert.ok(sof>0);wideJpeg.writeUInt16BE(16385,sof+7);
 bigWebp.writeUInt32LE((9999|(4999<<14))>>>0,21);wrongRiff.writeUInt32LE(999,4);
 for(const [name,bytes]of [['wide.jpg',wideJpeg],['big.webp',bigWebp],['short.jpg',truncatedJpeg],['wrong.webp',wrongRiff]]){await writeFile(path.join(h.root,name),bytes);await assert.rejects(h.service.command(h.owner,{type:'view_image',path:name}));}assert.equal(h.calls,0);
});
test('rejects nonregular files and oversized bytes before decode',async t=>{
 const h=await harness(t);await mkdir(path.join(h.root,'dir.png'));await writeFile(path.join(h.root,'large.png'),Buffer.alloc(20*1024*1024+1));
 for(const name of ['dir.png','large.png'])await assert.rejects(h.service.command(h.owner,{type:'view_image',path:name}));assert.equal(h.calls,0);
});
test('rejects symbolic-link files and directories including project-internal aliases',async t=>{
 const h=await harness(t);await mkdir(path.join(h.folder,'external'));await writeFile(path.join(h.folder,'external','pixel.png'),source);
 try{await symlink(path.join(h.folder,'external'),path.join(h.root,'alias'),'junction');await symlink(path.join(h.root,'pixel.png'),path.join(h.root,'link.png'),'file');}catch(error){if(error.code==='EPERM'){t.skip('File symlinks require Windows developer mode or privilege.');return;}throw error;}
 for(const name of ['alias/pixel.png','link.png'])await assert.rejects(h.service.command(h.owner,{type:'view_image',path:name}));assert.equal(h.calls,0);
});
test('rejects cross-chat, changed project root, and expired owner before decode',async t=>{
 const h=await harness(t);h.state.task.id='other';await assert.rejects(h.service.command(h.owner,{type:'view_image',path:'pixel.png'}));h.state.task.id='chat';h.state.activeProject.root=h.folder;await assert.rejects(h.service.command(h.owner,{type:'list_images'}));h.state.activeProject.root=h.root;h.revoke();await assert.rejects(h.service.command(h.owner,{type:'view_image',path:'pixel.png'}));assert.equal(h.calls,0);
});
test('revocation or chat switch during media read never reaches decoder',async t=>{
 for(const switchChat of [false,true]){const h=await harness(t);h.setMedia(async input=>{if(input.type==='list')return{items:[{id:'upload:one',name:'pixel.png',kind:'uploaded'}]};if(switchChat)h.state.task.id='other';else h.revoke();return{dataUrl:dataUrl(source)};});await assert.rejects(h.service.command(h.owner,{type:'view_image',id:'upload:one'}));assert.equal(h.calls,0);}
});
test('expired owner and changed chat during normalization discard image output',async t=>{
 for(const switchChat of [false,true]){const h=await harness(t);h.setNormalize(async()=>{if(switchChat)h.state.task.id='other';else h.revoke();return{imageDataUrl:dataUrl(source),width:1,height:1,originalWidth:1,originalHeight:1};});await assert.rejects(h.service.command(h.owner,{type:'view_image',path:'pixel.png'}));}
});
test('source replacement and root replacement during normalization discard result',async t=>{
 for(const replaceRoot of [false,true]){const h=await harness(t);h.setNormalize(async()=>{if(replaceRoot){await rename(h.root,h.root+'-old');await mkdir(h.root);await writeFile(path.join(h.root,'pixel.png'),source);}else await writeFile(path.join(h.root,'pixel.png'),png(2,1));return{imageDataUrl:dataUrl(source),width:1,height:1,originalWidth:1,originalHeight:1};});await assert.rejects(h.service.command(h.owner,{type:'view_image',path:'pixel.png'}));}
});
test('marks normalized resizes and rejects invalid normalization metadata',async t=>{
 const h=await harness(t);h.setNormalize(async()=>({imageDataUrl:dataUrl(source),width:1,height:1,originalWidth:2,originalHeight:1}));await assert.rejects(h.service.command(h.owner,{type:'view_image',path:'pixel.png'}));
 h.setNormalize(async()=>({imageDataUrl:dataUrl(source),width:1,height:1,originalWidth:1,originalHeight:1}));assert.equal((await h.service.command(h.owner,{type:'view_image',path:'pixel.png'})).resized,false);
});
