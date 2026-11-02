import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,rename,truncate} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {crc32,deflateRawSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const {createFilePreview}=await import('../electron/file-preview.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});

async function fixture(t){
 const base=await mkdtemp(path.join(os.tmpdir(),'musebench-file-preview-')),root=path.join(base,'project'),assets=path.join(base,'assets');
 await mkdir(root);await mkdir(assets);t.after(()=>rm(base,{recursive:true,force:true}));
 const state={activeProject:{id:'project',root},task:{id:'task',projectId:'project',changes:[],messages:[]}};
 assert.equal(typeof createFilePreview,'function','file preview service must be implemented');
 const service=createFilePreview({getState:()=>state,assetRoot:assets});t.after(()=>service.close());
 return{base,root,assets,state,service,async put(name,bytes){const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);},open(name){return service.command({type:'open',taskId:'task',path:name});},request(url,options){return service.handle(new Request(url,options));}};
}
function zip(entries){
 const locals=[],centrals=[];let offset=0;
 for(const {name,text='',declaredSize,crc,method=8} of entries){const filename=Buffer.from(name),raw=Buffer.from(text),packed=method===8?deflateRawSync(raw):raw,checksum=crc??crc32(raw),size=declaredSize??raw.length;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);local.writeUInt32LE(checksum,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(filename.length,26);
  locals.push(local,filename,packed);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);central.writeUInt32LE(checksum,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(size,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);centrals.push(central,filename);offset+=local.length+filename.length+packed.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
const ooxml=(kind='docx',extra=[])=>zip([{name:'[Content_Types].xml',text:'<Types/>'},{name:kind==='docx'?'word/document.xml':'ppt/presentation.xml',text:'<document/>'},...extra]);

test('snapshot returns actual immutable bytes, source, opaque capability and bounded ranges',async t=>{
 const f=await fixture(t);await f.put('out/report.html','<h1>First</h1>');const file=await f.open('out/report.html');
 assert.equal(file.kind,'html');assert.equal(file.path,'out/report.html');assert.equal(file.source,'<h1>First</h1>');assert.match(file.revision,/^[a-f0-9]{64}$/);assert.doesNotMatch(file.rawUrl,new RegExp(f.root.replace(/\\/g,'\\\\')));
 await f.put('out/report.html','<h1>Second</h1>');const response=await f.request(file.rawUrl);assert.equal(await response.text(),'<h1>First</h1>');assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.match(response.headers.get('content-security-policy'),/sandbox allow-scripts/);assert.doesNotMatch(response.headers.get('content-security-policy'),/allow-same-origin/);
 const range=await f.request(file.rawUrl,{headers:{range:'bytes=4-8'}});assert.equal(range.status,206);assert.equal(await range.text(),'First');assert.equal((await f.request(file.rawUrl,{headers:{range:'bytes=999-'}})).status,416);
 assert.equal((await f.request(file.rawUrl,{method:'POST'})).status,405);assert.equal((await f.request(file.rawUrl,{method:'HEAD'})).body,null);
});
test('list discovers valid outputs from changes, sources, files and local Markdown links',async t=>{
 const f=await fixture(t);for(const name of ['out/a.html','out/b.pdf','out/c.md','out/d.pptx','out/e.txt','plain.txt','.env','run.exe'])await f.put(name,'fixture');
 f.state.task.changes=[{path:'out/a.html'},{path:'../outside.pdf'},{path:'.env'}];f.state.task.messages=[{files:[{path:'out/b.pdf'}],sources:[{path:'out/c.md'}],text:'[slides](out/d.pptx) [notes](<out/e.txt>) [web](https://bad.test/a.pdf) [secret](.env)'}];
 const list=await f.service.command({type:'list',taskId:'task'});assert.deepEqual(list.outputs.map(item=>item.path).sort(),['out/a.html','out/b.pdf','out/c.md','out/d.pptx','out/e.txt']);assert.deepEqual(list.entries.map(item=>item.path),['out','plain.txt']);
 const nested=await f.service.command({type:'list',taskId:'task',directory:'out'});assert.equal(nested.entries.length,5);assert.equal(nested.directory,'out');
});
test('commands strictly reject injected fields, roots, unsafe paths and unsupported executable formats',async t=>{
 const f=await fixture(t);await f.put('safe.txt','safe');
 for(const input of [{type:'open',taskId:'task',path:'safe.txt',root:f.root},{type:'list',taskId:'task',path:'safe.txt'},{type:'close',taskId:'task',comments:[]},{type:'list',taskId:'task',offset:-1}])await assert.rejects(f.service.command(input),/invalid|command|offset/i);
 for(const name of ['../outside.txt','/absolute.txt','C:/Windows/file.txt','\\\\server\\file.txt','x\\file.txt','.env','dir/.secret.txt','run.exe','run.ps1','old.doc','macro.docm'])await assert.rejects(f.open(name),/path|supported|file|format|macro/i);
 await assert.rejects(f.service.command({type:'open',taskId:'other',path:'safe.txt'}),/chat|task/i);
});
test('symlink and junction escapes cannot be listed, opened or served as relative assets',async t=>{
 const f=await fixture(t),outside=path.join(f.base,'outside');await mkdir(outside);await writeFile(path.join(outside,'secret.txt'),'secret');await f.put('page.html','hello');await symlink(outside,path.join(f.root,'jump'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(f.open('jump/secret.txt'),/path|link/i);const list=await f.service.command({type:'list',taskId:'task'});assert.equal(list.entries.some(item=>item.name==='jump'),false);
 const file=await f.open('page.html');assert.equal((await f.request(file.resourceBaseUrl+'jump/secret.txt')).status,403);
});
test('relative resources stay below approved parent and trusted assets use fixed root and separate policy',async t=>{
 const f=await fixture(t);await f.put('out/page.html','<script src="app.js"></script>');await f.put('out/app.js','window.example=1');await f.put('out/theme.css','body{color:red}');await f.put('secret.json','{}');await writeFile(path.join(f.assets,'frame.html'),'<script src="frame.js"></script>');await writeFile(path.join(f.assets,'frame.js'),'/* trusted */');await writeFile(path.join(f.assets,'font.bcmap'),'map');
 const file=await f.open('out/page.html');assert.equal(await(await f.request(file.resourceBaseUrl+'app.js')).text(),'window.example=1');assert.equal((await f.request(file.resourceBaseUrl+'%2e%2e%2fsecret.json')).status,403);assert.equal((await f.request(file.resourceBaseUrl+'%252e%252e/secret.json')).status,403);
 const trusted=await f.request('musebench-files://assets/frame.html');assert.equal(trusted.status,200);assert.doesNotMatch(trusted.headers.get('content-security-policy'),/sandbox/);assert.match(trusted.headers.get('content-security-policy'),/worker-src musebench-files:\/\/assets blob:/);assert.equal((await f.request('musebench-files://assets/font.bcmap')).status,200);assert.equal((await f.request('musebench-files://assets/%2e%2e%2fproject/secret.json')).status,403);
 for(const [name,mime] of [['frame.js','text/javascript'],['pdf.worker.mjs','text/javascript'],['decoder.wasm','application/wasm'],['fallback.bin','application/octet-stream'],['font.pfb','application/octet-stream']]){await writeFile(path.join(f.assets,name),'bundled');const response=await f.request('musebench-files://assets/'+name);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);}
 assert.equal((await f.request('musebench-files://evil/frame.html')).status,403);
});
test('owner switches, root changes, explicit close and two-snapshot eviction revoke capabilities',async t=>{
 const f=await fixture(t);for(const name of ['a.txt','b.txt','c.txt'])await f.put(name,name);const a=await f.open('a.txt'),b=await f.open('b.txt'),c=await f.open('c.txt');assert.equal((await f.request(a.rawUrl)).status,403);assert.equal((await f.request(b.rawUrl)).status,200);
 await f.service.command({type:'close',taskId:'task',token:b.token});assert.equal((await f.request(b.rawUrl)).status,403);assert.equal((await f.request(c.rawUrl)).status,200);
 f.state.task.id='other';f.service.reconcile();assert.equal((await f.request(c.rawUrl)).status,403);f.state.task.id='task';const next=await f.open('a.txt');f.state.activeProject.root=f.assets;assert.equal((await f.request(next.rawUrl)).status,403);
});
test('feedback stays draft-only, carries revision and rejects stale bytes and malformed coordinates',async t=>{
 const f=await fixture(t);await f.put('report.md','# Actual report');const file=await f.open('report.md'),comments=[{page:2,x:.25,y:.75,quote:'Actual',note:'Please expand this.'}];
 const result=await f.service.command({type:'feedback',taskId:'task',token:file.token,comments});assert.equal(result.taskId,'task');for(const value of ['report.md',file.revision,'Please expand this.','Actual'])assert.ok(result.text.includes(value));assert.deepEqual(f.state.task.messages,[]);
 for(const comment of [{page:0,x:0,y:0,note:'x'},{page:1,x:1.1,y:0,note:'x'},{page:1,x:0,y:NaN,note:'x'},{page:1,x:0,y:0,note:''},{page:1,x:0,y:0,note:'x',execute:true}])await assert.rejects(f.service.command({type:'feedback',taskId:'task',token:file.token,comments:[comment]}),/comment|coordinate|invalid/i);
 await f.put('report.md','# Changed report');await assert.rejects(f.service.command({type:'feedback',taskId:'task',token:file.token,comments}),/changed|stale/i);
});
test('valid DOCX and PPTX retain original bytes and unsupported office files are rejected honestly',async t=>{
 const f=await fixture(t);for(const kind of ['docx','pptx']){const bytes=ooxml(kind);await f.put('report.'+kind,bytes);const file=await f.open('report.'+kind);assert.equal(file.kind,kind);assert.deepEqual(Buffer.from(await(await f.request(file.rawUrl)).arrayBuffer()),bytes);assert.ok(file.warnings.length);}
 await f.put('broken.docx','not a zip');await assert.rejects(f.open('broken.docx'),/office|zip|document|archive/i);await f.put('wrong.docx',ooxml('pptx'));await assert.rejects(f.open('wrong.docx'),/office|document|format/i);
});
test('OOXML preflight rejects actual inflation, oversized claims, CRC corruption, traversal and macros',async t=>{
 const f=await fixture(t);const cases=[{name:'bomb.docx',entries:[{name:'word/bomb.xml',text:'A'.repeat(2*1024*1024),declaredSize:4}]},{name:'huge.docx',entries:[{name:'word/huge.xml',text:'x',declaredSize:300*1024*1024}]},{name:'crc.docx',entries:[{name:'word/data.xml',text:'data',crc:123}]},{name:'escape.docx',entries:[{name:'../secret.xml',text:'bad'}]},{name:'macro.docx',entries:[{name:'word/vbaProject.bin',text:'bad'}]}];
 for(const item of cases){await f.put(item.name,ooxml('docx',item.entries));await assert.rejects(f.open(item.name),/office|zip|archive|inflation|size|crc|macro|path|entry/i,item.name);}
});
test('local Markdown output links normalize relative and in-project file URLs without exposing foreign roots',async t=>{
 const f=await fixture(t);await f.put('out/report.md','report');await f.put('out/deck.pptx','deck');
 f.state.task.messages=[{text:`[report](./out/report.md#intro) [deck](${pathToFileURL(path.join(f.root,'out/deck.pptx')).href}) [foreign](file:///C:/Windows/passwords.txt)`}];
 const list=await f.service.command({type:'list',taskId:'task'});assert.deepEqual(list.outputs.map(file=>file.path),['out/report.md','out/deck.pptx']);
});
test('large sources are truncated while excessive files and too many ZIP entries fail before browser rendering',async t=>{
 const f=await fixture(t);await f.put('long.txt','A'.repeat(300*1024));const file=await f.open('long.txt');assert.equal(file.size,300*1024);assert.equal(file.source.length,256*1024);assert.equal(file.sourceTruncated,true);
 await f.put('oversized.pdf','%PDF-');await truncate(path.join(f.root,'oversized.pdf'),100*1024*1024+1);await assert.rejects(f.open('oversized.pdf'),/100 MiB/);
 await f.put('entries.docx',zip(Array.from({length:10001},(_,index)=>({name:`word/${index}.xml`,text:''}))));await assert.rejects(f.open('entries.docx'),/entry limit/i);
});
test('same-path root replacement revokes snapshot bytes and unchanged root accepts new outputs',async t=>{
 const f=await fixture(t);await f.put('report.txt','original');const file=await f.open('report.txt');await f.put('new.txt','new output');assert.equal((await f.request(file.rawUrl)).status,200);
 await rename(f.root,f.root+'-old');await mkdir(f.root);await f.put('report.txt','replacement');assert.equal((await f.request(file.rawUrl)).status,403);
});
test('host export saves only immutable snapshot bytes for the exact current owner and token',async t=>{
 const f=await fixture(t);await f.put('report.txt','original snapshot');const file=await f.open('report.txt');await f.put('report.txt','changed on disk');
 const exported=await f.service.exportFile({taskId:'task',token:file.token});assert.equal(exported.name,'report.txt');assert.equal(exported.bytes.toString(),'original snapshot');
 exported.bytes.fill(0);assert.equal((await f.service.exportFile({taskId:'task',token:file.token})).bytes.toString(),'original snapshot');
 await assert.rejects(f.service.exportFile({taskId:'other',token:file.token}),/chat|owner|task/i);await assert.rejects(f.service.exportFile({taskId:'task',token:file.token,path:'../secret.txt'}),/invalid/i);
 await f.service.command({type:'close',taskId:'task',token:file.token});await assert.rejects(f.service.exportFile({taskId:'task',token:file.token}),/closed|stale/i);
 const next=await f.open('report.txt');f.state.task.id='other';await assert.rejects(f.service.exportFile({taskId:'task',token:next.token}),/chat|owner|task/i);
});
test('navigation permits host viewer entry, trusted frame loads and same-token HTML navigation only',async t=>{
 const f=await fixture(t);await f.put('out/a.html','A');await f.put('out/b.html','B');const a=await f.open('out/a.html'),b=await f.open('out/b.html'),frame='musebench-files://assets/frame.html#nonce',decide=input=>f.service.navigationDecision(input);
 assert.equal(decide({url:frame,frameUrl:'about:blank',initiatorUrl:'file:///app/index.html',hostInitiated:true}),true);
 assert.equal(decide({url:a.rawUrl,frameUrl:'about:blank',initiatorUrl:frame}),true);assert.equal(decide({url:b.rawUrl,frameUrl:a.rawUrl,initiatorUrl:frame}),true);
 assert.equal(decide({url:a.resourceBaseUrl+'other.html#part',frameUrl:a.rawUrl,initiatorUrl:a.rawUrl}),true);assert.equal(decide({url:a.rawUrl+'#part',frameUrl:a.rawUrl,initiatorUrl:null}),true);
 for(const url of [b.rawUrl,frame,'musebench-files://assets/frame.js','https://evil.test','http://127.0.0.1:4318/','file:///secret','musebench-site://other/index.html','musebench-artifact://preview/id','javascript:alert(1)','about:blank','blob:null/foreign'])assert.equal(decide({url,frameUrl:a.rawUrl,initiatorUrl:a.rawUrl}),false,url);
 for(const url of [frame,'https://evil.test','file:///secret','musebench-files://assets/other.html'])assert.equal(decide({url,frameUrl:frame,initiatorUrl:frame}),false,url);
 assert.equal(decide({url:a.rawUrl,frameUrl:frame,initiatorUrl:a.rawUrl}),false,'file must not replace its parent trusted frame');
 assert.equal(decide({url:a.rawUrl,frameUrl:'about:blank',initiatorUrl:'https://evil.test'}),false);assert.equal(decide({url:frame,frameUrl:'about:blank',hostInitiated:false}),false);
 assert.equal(decide({url:'https://normal.test/',frameUrl:'https://normal.test/',initiatorUrl:'https://normal.test/'}),null);
});
test('navigation rejects invalid resources and tokens after owner changes or close',async t=>{
 const f=await fixture(t);await f.put('a.html','A');const file=await f.open('a.html'),frame='musebench-files://assets/frame.html#nonce',decide=url=>f.service.navigationDecision({url,frameUrl:'about:blank',initiatorUrl:frame});
 for(const url of [file.resourceBaseUrl+'%2e%2e%2fsecret.txt',file.resourceBaseUrl+'%252e%252e/secret.txt',file.resourceBaseUrl+'.env',file.resourceBaseUrl+'run.exe',file.rawUrl+'?injected=1','musebench-files://file/unknown/a.html','musebench-files://user@assets/frame.html','musebench-files://evil/frame.html'])assert.equal(decide(url),false,url);
 assert.equal(decide(file.rawUrl),true);await f.service.command({type:'close',taskId:'task',token:file.token});assert.equal(decide(file.rawUrl),false);
 const next=await f.open('a.html');f.state.task.id='other';assert.equal(decide(next.rawUrl),false);
});
