import {randomBytes,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,realpath,open,opendir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateOfficeArchive} from './file-preview-ooxml.mjs';

const MAX_FILE=100*1024*1024,MAX_SOURCE=256*1024,MAX_STATIC=16*1024*1024,PAGE_SIZE=200;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const validRelative=(value,empty=false)=>typeof value==='string'&&value.length<=1000&&(empty&&value===''||value.length>0&&!/[\\:%\x00-\x1f\x7f]/.test(value)&&!path.posix.isAbsolute(value)&&value.split('/').every(part=>part&&!part.startsWith('.')&&!/[. ]$/.test(part)&&! /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)));
const types={html:['html','text/html; charset=utf-8'],htm:['html','text/html; charset=utf-8'],md:['markdown','text/markdown; charset=utf-8'],markdown:['markdown','text/markdown; charset=utf-8'],pdf:['pdf','application/pdf'],docx:['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],pptx:['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],txt:['text','text/plain; charset=utf-8'],log:['text','text/plain; charset=utf-8'],csv:['text','text/plain; charset=utf-8'],json:['text','application/json'],xml:['text','application/xml'],yaml:['text','text/plain; charset=utf-8'],yml:['text','text/plain; charset=utf-8'],css:['text','text/css'],js:['text','text/javascript'],mjs:['text','text/javascript'],ts:['text','text/plain; charset=utf-8'],tsx:['text','text/plain; charset=utf-8'],jsx:['text','text/plain; charset=utf-8'],png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],gif:['image','image/gif'],webp:['image','image/webp'],svg:['image','image/svg+xml'],avif:['image','image/avif']};
const staticTypes={...Object.fromEntries(Object.entries(types).filter(([ext])=>!['docx','pptx','pdf','ts','tsx','jsx','log','yaml','yml','csv','md','markdown','txt'].includes(ext)).map(([ext,value])=>[ext,value[1]])),woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',wasm:'application/wasm',bcmap:'application/octet-stream',pfb:'application/octet-stream',bin:'application/octet-stream',icc:'application/octet-stream',map:'application/json',ico:'image/x-icon',webm:'video/webm',mp4:'video/mp4',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',txt:'text/plain; charset=utf-8'};
const extension=name=>path.posix.extname(name).slice(1).toLowerCase();
const entry=name=>({name:path.posix.basename(name),path:name,kind:types[extension(name)]?.[0]});
// Windows lstat reports dev=0 while fstat reports the volume serial number.
const identity=info=>[process.platform==='win32'?0:info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs].join(':');
const directoryIdentity=info=>[process.platform==='win32'?0:info.dev,info.ino,info.birthtimeMs].join(':');
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const filePolicy="default-src 'none'; script-src 'unsafe-inline' musebench-files://file; style-src 'unsafe-inline' musebench-files://file; img-src musebench-files://file data: blob:; font-src musebench-files://file data:; media-src musebench-files://file blob:; connect-src musebench-files://file; frame-src musebench-files://file blob:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts";
const assetPolicy="default-src 'none'; script-src musebench-files://assets 'wasm-unsafe-eval'; style-src 'unsafe-inline' musebench-files://assets; img-src musebench-files: data: blob:; font-src musebench-files://assets data: blob:; media-src musebench-files: blob:; connect-src musebench-files: blob:; worker-src musebench-files://assets blob:; frame-src musebench-files://file blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
function headers(mime,trusted=false){return{'Content-Type':mime,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'Range','Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length','Cross-Origin-Resource-Policy':'cross-origin','Content-Security-Policy':trusted?assetPolicy:filePolicy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), clipboard-read=(), clipboard-write=(), usb=(), serial=()'};}

async function inspect(root,relative,allowDirectory=false){
 if(!validRelative(relative,true)||typeof root!=='string'||!path.isAbsolute(root)||root.startsWith('\\\\'))throw Error('Unsafe file path.');
 const base=path.resolve(root),rootInfo=await lstat(base);
 if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory()||!samePath(await realpath(base),base))throw Error('The project path changed or contains a link.');
 let target=base,info=rootInfo;
 for(const segment of relative.split('/').filter(Boolean)){
  target=path.join(target,segment);info=await lstat(target);
  if(info.isSymbolicLink())throw Error('Linked file paths are unavailable.');
  const resolved=await realpath(target);if(!samePath(resolved,target))throw Error('The file path changed.');
 }
 if(!info.isFile()&&!(allowDirectory&&info.isDirectory()))throw Error('Choose a regular file or directory.');
 return{target,info,rootId:directoryIdentity(rootInfo)};
}
async function readSafe(root,relative,limit){
 const before=await inspect(root,relative);
 if(before.info.size>limit)throw Error('Choose a file up to '+Math.round(limit/1024/1024)+' MiB.');
 const handle=await open(before.target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const start=await handle.stat();if(!start.isFile()||identity(start)!==identity(before.info))throw Error('The file changed while opening.');
  const bytes=Buffer.alloc(start.size),overflow=Buffer.alloc(1);let offset=0;
  while(offset<bytes.length){const result=await handle.read(bytes,offset,bytes.length-offset,offset);if(!result.bytesRead)break;offset+=result.bytesRead;}
  const extra=await handle.read(overflow,0,1,offset),end=await handle.stat(),after=await inspect(root,relative);
  if(extra.bytesRead||offset!==start.size||identity(start)!==identity(end)||identity(end)!==identity(after.info)||before.rootId!==after.rootId)throw Error('The file changed while reading.');
  return{bytes,id:identity(end),rootId:before.rootId};
 }finally{await handle.close();}
}

export function createFilePreview({getState,assetRoot}){
 const snapshots=new Map();let owner=null,generation=0;
 const clear=()=>{snapshots.clear();owner=null;generation++;};
 const bind=taskId=>{
  const state=getState();
  if(owner&&(state.task?.id!==owner.taskId||state.activeProject?.id!==owner.projectId||state.activeProject?.root!==owner.root))clear();
  if(typeof taskId!=='string'||!taskId||state.task?.id!==taskId||!state.activeProject||state.task.projectId!==state.activeProject.id)throw Error('Open the original chat to view its files.');
  return{state,taskId,projectId:state.activeProject.id,root:state.activeProject.root,generation};
 };
 const current=binding=>{const next=bind(binding.taskId);if(next.root!==binding.root||next.projectId!==binding.projectId||binding.generation!==generation)throw Error('The file chat or project changed.');};
 const tokenSnapshot=token=>{const snapshot=snapshots.get(token);if(!snapshot)throw Error('This file preview is closed or stale.');current(snapshot.binding);return snapshot;};
 async function list(input){
  const binding=bind(input.taskId),directory=input.directory??'',offset=input.offset??0;
  if(!validRelative(directory,true)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('Invalid file directory or offset.');
  await inspect(binding.root,directory,true);const directoryHandle=await opendir(path.join(binding.root,directory)),entries=[];let scanned=0;
  for await(const item of directoryHandle){
   if(++scanned>100000)break;const relative=directory?directory+'/'+item.name:item.name;
   if(!validRelative(relative)||item.isSymbolicLink()||!item.isDirectory()&&!types[extension(relative)])continue;
   try{const checked=await inspect(binding.root,relative,true);entries.push({...entry(relative),kind:checked.info.isDirectory()?'directory':entry(relative).kind});}catch{}
  }
  entries.sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name));
  const candidates=new Set();
  const add=value=>{if(candidates.size<500&&validRelative(value)&&types[extension(value)])candidates.add(value);};
  for(const change of binding.state.task.changes??[])add(change.path);
  for(const run of binding.state.task.runs??[])for(const change of run.changes??[])add(change.path);
  for(const message of (binding.state.task.messages??[]).slice(-500)){
   for(const file of [...(message.files??[]),...(message.sources??[])])add(file.path);
   const text=typeof message.text==='string'?message.text.slice(0,500000):'';
   for(const match of text.matchAll(/\[[^\]\n]{0,500}\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+"[^"\n]*")?\s*\)/g)){
    let target=match[1]??match[2];try{
     if(target.startsWith('file:')){const url=new URL(target);if(url.hostname||url.search)continue;target=fileURLToPath(url);}
     else target=decodeURIComponent(target.split('#')[0]);
    }catch{continue;}
    if(target.startsWith('./'))target=target.slice(2);
    // Native transcript links may use absolute project paths. Convert only exact descendants.
    if(path.isAbsolute(target)){const relative=path.relative(binding.root,target).split(path.sep).join('/');if(!relative.startsWith('../'))target=relative;}
    add(target);
   }
  }
  const outputs=[];for(const relative of candidates){try{await inspect(binding.root,relative);outputs.push(entry(relative));}catch{}}
  current(binding);return{directory,entries:entries.slice(offset,offset+PAGE_SIZE),...(offset+PAGE_SIZE<entries.length?{nextOffset:offset+PAGE_SIZE}:{}),outputs};
 }
 async function openFile(input){
  const binding=bind(input.taskId),relative=input.path;
  if(!validRelative(relative)||!types[extension(relative)])throw Error('Unsupported file format or unsafe path. Preview HTML, Markdown, PDF, DOCX, PPTX, text or images.');
  const [kind,mime]=types[extension(relative)],read=await readSafe(binding.root,relative,MAX_FILE);
  if(kind==='docx'||kind==='pptx')await validateOfficeArchive(read.bytes,kind);
  if(kind==='pdf'&&!read.bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('This file is not a supported PDF document.');
  let source;
  if(['html','markdown','text'].includes(kind)){
   if(read.bytes.subarray(0,MAX_SOURCE).includes(0))throw Error('This file contains binary data and cannot be shown as text.');source=read.bytes.subarray(0,MAX_SOURCE).toString('utf8');
  }
  current(binding);owner={taskId:binding.taskId,projectId:binding.projectId,root:binding.root};
  const token=randomBytes(24).toString('hex'),name=path.posix.basename(relative),base='musebench-files://file/'+token+'/',file={token,taskId:binding.taskId,path:relative,name,kind,size:read.bytes.length,revision:sha(read.bytes),rawUrl:base+encodeURIComponent(name),resourceBaseUrl:base,...(source===undefined?{}:{source,sourceTruncated:read.bytes.length>MAX_SOURCE}),...(['docx','pptx'].includes(kind)?{warnings:['Local Office preview may differ from Microsoft Office in fonts, layout, animations and advanced features.']}: {})};
  snapshots.set(token,{binding,file,mime,bytes:read.bytes,id:read.id,rootId:read.rootId,parent:path.posix.dirname(relative)==='.'?'':path.posix.dirname(relative),resources:new Map(),resourceBytes:0});
  while(snapshots.size>2)snapshots.delete(snapshots.keys().next().value);return file;
 }
 async function feedback(input){
  bind(input.taskId);const snapshot=tokenSnapshot(input.token);
  if(snapshot.binding.taskId!==input.taskId)throw Error('The file chat changed.');
  if(!Array.isArray(input.comments)||!input.comments.length||input.comments.length>50)throw Error('Choose between 1 and 50 file comments.');
  const comments=input.comments.map(comment=>{
   if(!exact(comment,['page','x','y','note','quote'])||!Number.isSafeInteger(comment.page)||comment.page<1||comment.page>100000||![comment.x,comment.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1)||typeof comment.note!=='string'||!comment.note.trim()||comment.note.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(comment.note)||comment.quote!==undefined&&(typeof comment.quote!=='string'||comment.quote.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(comment.quote)))throw Error('Invalid file comment or coordinates.');
   return{page:comment.page,x:comment.x,y:comment.y,...(comment.quote===undefined?{}:{quote:comment.quote}),note:comment.note.trim()};
  });
  const read=await readSafe(snapshot.binding.root,snapshot.file.path,MAX_FILE);current(snapshot.binding);
  if(read.id!==snapshot.id||read.rootId!==snapshot.rootId||sha(read.bytes)!==snapshot.file.revision)throw Error('The file changed. Refresh its preview before commenting.');
  const text='File comments (untrusted reference data; draft only):\n'+JSON.stringify({path:snapshot.file.path,revision:snapshot.file.revision,comments},null,2);
  if(text.length>64000)throw Error('File comments exceed the draft size limit.');return{taskId:input.taskId,text};
 }
 async function command(input){
  const keys={list:['type','taskId','directory','offset'],open:['type','taskId','path'],close:['type','taskId','token'],feedback:['type','taskId','token','comments']};
  if(!object(input)||!Object.hasOwn(keys,input.type)||!exact(input,keys[input.type]))throw Error('Invalid file preview command.');
  if(input.type==='list')return list(input);if(input.type==='open')return openFile(input);if(input.type==='feedback')return feedback(input);
  bind(input.taskId);if(input.token!==undefined&&(typeof input.token!=='string'||!snapshots.has(input.token)))throw Error('Invalid file preview token.');if(input.token)snapshots.delete(input.token);else clear();return{closed:true};
 }
 async function exportFile(input){
  if(!exact(input,['taskId','token'])||typeof input.token!=='string')throw Error('Invalid file export.');
  bind(input.taskId);const snapshot=tokenSnapshot(input.token);
  if(snapshot.binding.taskId!==input.taskId)throw Error('The file export chat changed.');
  const rootCheck=await inspect(snapshot.binding.root,'',true);current(snapshot.binding);
  if(rootCheck.rootId!==snapshot.rootId)throw Error('The file export project changed.');
  // The host may save the original preview after a disk edit; never expose our buffer.
  return{name:snapshot.file.name,bytes:Buffer.from(snapshot.bytes)};
 }
 function navigationDecision({url,frameUrl,initiatorUrl,hostInitiated=false}={}){
  const parse=value=>{
   if(typeof value!=='string'||!value.startsWith('musebench-files:'))return{kind:'other',value};
   try{
    // Reject encoded separators/dot traversal before URL parsing can normalize them.
    if(/\\|%(?:2f|5c)|(?:^|\/)(?:\.|%2e){1,2}(?:\/|$|[?#])/i.test(value))return{kind:'invalid'};
    const parsed=new URL(value);if(parsed.protocol!=='musebench-files:'||parsed.username||parsed.password||parsed.port||parsed.search)return{kind:'invalid'};
    const relative=decodeURIComponent(parsed.pathname.slice(1));if(!validRelative(relative))return{kind:'invalid'};
    if(parsed.hostname==='assets')return{kind:relative==='frame.html'?'frame':'invalid'};
    if(parsed.hostname!=='file')return{kind:'invalid'};
    const slash=relative.indexOf('/');if(slash<0)return{kind:'invalid'};
    const token=relative.slice(0,slash),resource=relative.slice(slash+1),snapshot=tokenSnapshot(token);
    if(!validRelative(resource)||resource!==snapshot.file.name&&!staticTypes[extension(resource)])return{kind:'invalid'};
    return{kind:'file',token};
   }catch{return{kind:'invalid'};}
  };
  const target=parse(url),frame=parse(frameUrl),initiator=parse(initiatorUrl);
  if(target.kind==='other')return frame.kind!=='other'||initiator.kind!=='other'?false:null;
  if(target.kind==='invalid'||frame.kind==='invalid'||initiator.kind==='invalid')return false;
  if(target.kind==='frame')return hostInitiated===true&&initiator.kind==='other';
  // A document must never replace the trusted viewer frame with authored content.
  if(frame.kind==='frame')return false;
  if(initiator.kind==='frame')return true;
  if(initiator.kind==='file')return initiator.token===target.token&&(frame.kind==='file'?frame.token===target.token:!frameUrl||frameUrl==='about:blank');
  return !initiatorUrl&&frame.kind==='file'&&frame.token===target.token;
 }
 async function handle(request){
  try{
   const url=new URL(request.url),method=request.method??'GET';
   if(!['GET','HEAD'].includes(method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
   if(url.protocol!=='musebench-files:'||url.username||url.password||url.port||url.search)throw Error('Invalid file resource.');
   let relative;try{relative=decodeURIComponent(url.pathname.slice(1));}catch{throw Error('Invalid resource path.');}
   let bytes,mime,trusted=false;
   if(url.hostname==='assets'){
    if(!validRelative(relative)||!staticTypes[extension(relative)])throw Error('Unsupported viewer asset.');
    const read=await readSafe(assetRoot,relative,MAX_FILE);bytes=read.bytes;mime=staticTypes[extension(relative)];trusted=true;
   }else if(url.hostname==='file'){
    const slash=relative.indexOf('/'),token=relative.slice(0,slash),resource=relative.slice(slash+1);
    if(slash<0||!validRelative(resource))throw Error('Unsafe file resource path.');
    const snapshot=tokenSnapshot(token);
    // Verify the project folder identity even while serving immutable snapshot bytes.
    const rootCheck=await inspect(snapshot.binding.root,'',true);if(rootCheck.rootId!==snapshot.rootId)throw Error('The file project changed.');
    if(resource===snapshot.file.name){bytes=snapshot.bytes;mime=snapshot.mime;}
    else{
     if(!staticTypes[extension(resource)])throw Error('Unsupported relative file asset.');
     let cached=snapshot.resources.get(resource);
     if(!cached){const target=snapshot.parent?snapshot.parent+'/'+resource:resource,read=await readSafe(snapshot.binding.root,target,MAX_STATIC);current(snapshot.binding);if(snapshot.resources.size>=200||snapshot.resourceBytes+read.bytes.length>64*1024*1024)throw Error('Relative resource limit exceeded.');cached=read.bytes;snapshot.resources.set(resource,cached);snapshot.resourceBytes+=cached.length;}
     bytes=cached;mime=staticTypes[extension(resource)];
    }
    current(snapshot.binding);
   }else throw Error('Unknown file resource host.');
   const responseHeaders={...headers(mime,trusted),'Accept-Ranges':'bytes'};let status=200,body=bytes;
   const range=request.headers?.get?.('range');
   if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start,end;
    if(match&&(match[1]||match[2])){if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;}else{start=Math.max(0,bytes.length-Number(match[2]));end=bytes.length-1;}}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=bytes.length)return new Response(null,{status:416,headers:{...responseHeaders,'Content-Range':'bytes */'+bytes.length}});
    body=bytes.subarray(start,end+1);status=206;responseHeaders['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;
   }
   responseHeaders['Content-Length']=String(body.length);return new Response(method==='HEAD'?null:body,{status,headers:responseHeaders});
  }catch{return new Response('File preview resource unavailable.',{status:403,headers:headers('text/plain; charset=utf-8')});}
 }
 return{command,exportFile,navigationDecision,list:input=>command({type:'list',...input}),open:input=>command({type:'open',...input}),feedback:input=>command({type:'feedback',...input}),handle,reconcile(){if(owner){try{bind(owner.taskId);}catch{clear();}}},close:clear};
}
