import path from 'node:path';
import {constants} from 'node:fs';
import {lstat,realpath,readdir,mkdir,open,unlink,rmdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const LIMITS=Object.freeze({files:200,totalBytes:26214400,fileBytes:5242880});
const mimeTypes={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.avif':'image/avif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'};
const textExtensions=new Set(['.html','.htm','.css','.js','.mjs','.json','.svg','.txt','.xml','.webmanifest']);
const sensitiveNames=/^(?:src|source|sources|node_modules|vendor|private|secrets?|credentials?|config|configuration|package(?:-lock)?|npm-shrinkwrap|yarn|pnpm-lock|bun|tsconfig|jsconfig|netlify|vercel|wrangler|firebase|dockerfile|docker-compose|id_rsa|id_ed25519|authorized_keys|known_hosts)(?:\.|$)/i;
const digest=(algorithm,value)=>createHash(algorithm).update(value).digest('hex');
function fail(message){throw new Error(message);}
function publicPath(value){
 if(typeof value!=='string'||!value||value.length>512||value!==value.normalize('NFC')||/[\\:%?#<>"|*\u0000-\u001f\u007f]/.test(value)||value.startsWith('/'))fail('Unsafe site path. Use a relative public asset path.');
 const parts=value.split('/');if(parts.length>16)fail('Unsafe site path: too many nested folders.');
 for(const part of parts){if(!part||part.startsWith('.')||/[. ]$/.test(part)||part.length>255)fail(`Unsafe or hidden site path: ${value}`);if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))fail(`Reserved Windows site path: ${value}`);if(sensitiveNames.test(part))fail(`Sensitive or configuration file is not publishable: ${value}`);}
 return value;
}
function fileMime(file){const mime=mimeTypes[path.posix.extname(file).toLowerCase()];if(!mime)fail(`Unsupported site file: ${file}. Import the built static output folder.`);return mime;}
function textBuffer(data,file){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{fail(`Invalid UTF-8 text in ${file}.`);}if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))fail(`Invalid text bytes in ${file}.`);return text;}
function makeBundle(input,stored=false){
 if(!Array.isArray(input)||input.length===0)fail('A site must contain index.html.');if(input.length>LIMITS.files)fail(`Too many site files. The file limit is ${LIMITS.files}.`);
 const seen=new Set();let totalBytes=0;const files=[];
 for(const entry of input){if(!entry||typeof entry!=='object')fail('Invalid site file.');const file=publicPath(entry.path),mime=fileMime(file),key=file.toLowerCase();if(seen.has(key))fail(`Duplicate site path: ${file}`);seen.add(key);
  let data;if(stored){if(typeof entry.data!=='string'||entry.data.length>Math.ceil(LIMITS.fileBytes/3)*4)fail(`Site file size limit exceeded: ${file}`);if(entry.data.length%4||/[^A-Za-z0-9+/=]/.test(entry.data))fail(`Invalid base64 site data: ${file}`);data=Buffer.from(entry.data,'base64');if(data.toString('base64')!==entry.data)fail(`Invalid base64 site data: ${file}`);}
  else if(Buffer.isBuffer(entry.data))data=entry.data;else if(typeof entry.data==='string'){if(entry.data.isWellFormed&&!entry.data.isWellFormed())fail(`Invalid UTF-8 text in ${file}.`);data=Buffer.from(entry.data,'utf8');}else fail(`Invalid site data: ${file}`);
  if(data.length>LIMITS.fileBytes)fail(`Site file size limit exceeded: ${file}`);totalBytes+=data.length;if(totalBytes>LIMITS.totalBytes)fail('Site total byte limit exceeded (25 MiB).');if(textExtensions.has(path.posix.extname(file).toLowerCase()))textBuffer(data,file);
  files.push({path:file,bytes:data.length,sha1:digest('sha1',data),mime,data:data.toString('base64')});
 }
 for(const file of files){const parts=file.path.toLowerCase().split('/');for(let i=1;i<parts.length;i++)if(seen.has(parts.slice(0,i).join('/')))fail(`File and directory path collision: ${file.path}`);}
 if(!files.some(file=>file.path==='index.html'))fail('The built site must contain index.html in its root folder.');
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {files,hash:digest('sha256',JSON.stringify(files.map(file=>[file.path,file.bytes,digest('sha256',Buffer.from(file.data,'base64'))]))),totalBytes};
}
export function bundleFromFiles(files){return makeBundle(files);}
export function validateBundle(value){if(!value||typeof value!=='object')fail('Invalid site bundle.');return makeBundle(value.files,true);}
export function readSiteFile(value,file){const bundle=validateBundle(value),name=publicPath(file),entry=bundle.files.find(item=>item.path===name);if(!entry)fail('Site file not found.');if(!textExtensions.has(path.posix.extname(name).toLowerCase()))fail('This binary asset is not an editable text file.');return textBuffer(Buffer.from(entry.data,'base64'),name);}
export function replaceSiteFile(value,file,text){const bundle=validateBundle(value);readSiteFile(bundle,file);if(typeof text!=='string')fail('Site edit must be text.');return bundleFromFiles(bundle.files.map(entry=>({path:entry.path,data:entry.path===file?text:Buffer.from(entry.data,'base64')})));}

function nativeDirectory(value){if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0')||/^\\\\|^\/\//.test(value)||(process.platform==='win32'&&!/^[a-z]:[\\/]/i.test(value)))fail('Choose a native absolute local site folder.');const directory=path.resolve(value);if(directory===path.parse(directory).root)fail('A filesystem root cannot be a site folder.');return directory;}
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
// Windows lstat can report dev=0 while a handle stat reports the real volume ID.
const sameFile=(a,b)=>a.ino===b.ino&&(!a.dev||!b.dev||a.dev===b.dev);
async function guardedAncestors(value,{create=false}={}){
 const absolute=path.resolve(value),root=path.parse(absolute).root,parts=absolute.slice(root.length).split(path.sep).filter(Boolean);let current=root;
 for(const part of parts){current=path.join(current,part);let stat;try{stat=await lstat(current);}catch(error){if(error.code!=='ENOENT'||!create)throw error;await mkdir(current);stat=await lstat(current);}
  if(stat.isSymbolicLink())fail('Site folder links and junction aliases are not supported.');if(!stat.isDirectory())fail('The site path must contain only ordinary folders.');if(!samePath(await realpath(current),current))fail('Site folder aliases are not supported.');
 }
 return absolute;
}
function contained(root,target){const relative=path.relative(root,target);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('Unsafe site filesystem path.');}
async function scanDirectory(directory,{publicFiles=true}={}){
 const results=[];let count=0,total=0;
 async function walk(parent,relative='',depth=0){if(depth>16)fail('Site folders are nested too deeply.');await guardedAncestors(parent);const entries=await readdir(parent,{withFileTypes:true});
  for(const entry of entries){const name=relative?`${relative}/${entry.name}`:entry.name,absolute=path.join(parent,entry.name);contained(directory,absolute);const stat=await lstat(absolute);if(stat.isSymbolicLink())fail(`Site links and junctions are not supported: ${name}`);
   if(!samePath(await realpath(absolute),absolute))fail(`Site aliases are not supported: ${name}`);if(publicFiles)publicPath(name);if(stat.isDirectory()){await walk(absolute,name,depth+1);results.push({absolute,name,directory:true});continue;}
   if(!stat.isFile())fail(`Unsupported filesystem entry: ${name}`);if(stat.nlink>1)fail(`Hard-linked site files are not supported: ${name}`);if(publicFiles){fileMime(name);count++;total+=stat.size;if(count>LIMITS.files)fail('Too many site files.');if(stat.size>LIMITS.fileBytes)fail(`Site file size limit exceeded: ${name}`);if(total>LIMITS.totalBytes)fail('Site total byte limit exceeded (25 MiB).');}else if(++count>2000)fail('Managed site folder contains too many files to safely replace.');
   results.push({absolute,name,directory:false,stat});
  }
 }
 await walk(directory);return results;
}
async function guardedRead(root,entry){
 await guardedAncestors(path.dirname(entry.absolute));const before=await lstat(entry.absolute);if(before.isSymbolicLink()||before.nlink>1||!before.isFile())fail('Site file changed or became a link while importing.');contained(root,entry.absolute);
 const handle=await open(entry.absolute,constants.O_RDONLY|(constants.O_NOFOLLOW||0));try{const stat=await handle.stat();if(stat.size>LIMITS.fileBytes||stat.nlink>1||!sameFile(stat,before))fail('Site file changed or became a link while importing.');const buffer=Buffer.alloc(Math.min(stat.size+1,LIMITS.fileBytes+1));let length=0;while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}const data=buffer.subarray(0,length);const after=await lstat(entry.absolute);await guardedAncestors(path.dirname(entry.absolute));if(after.isSymbolicLink()||after.nlink>1||!sameFile(after,stat)||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||data.length!==stat.size||!samePath(await realpath(entry.absolute),entry.absolute))fail('Site file changed while importing.');return data;}finally{await handle.close();}
}
export async function collectSite(value){const directory=nativeDirectory(value);await guardedAncestors(directory);const entries=await scanDirectory(directory);const files=[];for(const entry of entries)if(!entry.directory)files.push({path:entry.name,data:await guardedRead(directory,entry)});return bundleFromFiles(files);}
export async function writeSiteDirectory(value,target){
 const bundle=validateBundle(value),directory=nativeDirectory(target);await guardedAncestors(directory,{create:true});const existing=await scanDirectory(directory,{publicFiles:false}),wanted=new Set(bundle.files.map(file=>file.path));
 // Never use recursive deletion: validate each existing entry before removing it.
 for(const entry of existing){if(entry.directory||wanted.has(entry.name))continue;await guardedAncestors(path.dirname(entry.absolute));const stat=await lstat(entry.absolute);if(stat.isSymbolicLink()||stat.nlink>1||!stat.isFile())fail('Managed site changed or became a link while replacing files.');contained(directory,entry.absolute);await unlink(entry.absolute);}
 for(const entry of existing.filter(entry=>entry.directory)){await guardedAncestors(entry.absolute);try{await rmdir(entry.absolute);}catch(error){if(!['ENOTEMPTY','EEXIST'].includes(error.code))throw error;}}
 for(const file of bundle.files){const destination=path.join(directory,...file.path.split('/'));contained(directory,destination);await guardedAncestors(path.dirname(destination),{create:true});let current;try{current=await lstat(destination);}catch(error){if(error.code!=='ENOENT')throw error;}if(current&&(current.isSymbolicLink()||current.nlink>1||!current.isFile()))fail('Managed site destination is a link or not an ordinary file.');
  const handle=await open(destination,constants.O_WRONLY|constants.O_CREAT|(constants.O_NOFOLLOW||0),0o600);try{const stat=await handle.stat();if(stat.nlink>1||(current&&!sameFile(stat,current)))fail('Managed site changed or became a link while writing.');await guardedAncestors(path.dirname(destination));if(!samePath(await realpath(destination),destination))fail('Managed site destination is an alias.');await handle.truncate(0);await handle.writeFile(Buffer.from(file.data,'base64'));}finally{await handle.close();}
 }
}

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function starterSite(template='landing',title='My site',description='A new place for your next idea.'){
 if(!['landing','portfolio','blank'].includes(template))fail('Unknown site template.');const safeTitle=escapeHtml(String(title).slice(0,160)),safeDescription=escapeHtml(String(description).slice(0,1000));
 const extra=template==='blank'?'':template==='portfolio'?'<section class="grid" id="work"><article><span>01 / SELECTED WORK</span><h2>Make something memorable.</h2><p>Introduce a project and the thinking behind it.</p></article><article><span>02 / ABOUT</span><h2>A little about me.</h2><p>Tell visitors what you care about and what comes next.</p></article></section>':'<section class="grid" id="more"><article><span>THOUGHTFULLY MADE</span><h2>A clear idea.</h2><p>Start with what matters. Make it simple to understand.</p></article><article><span>READY TO EXPLORE</span><h2>Room to grow.</h2><p>Make this space your own with Muse.</p></article></section>';
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeDescription}"><link rel="stylesheet" href="styles.css"></head><body><header><a class="brand" href="#">${safeTitle}</a><span>MADE WITH MUSEBENCH</span></header><main><section class="hero"><p class="eyebrow">${template==='portfolio'?'A COLLECTION OF IDEAS':'SOMETHING GOOD STARTS HERE'}</p><h1>${safeTitle}</h1><p class="description">${safeDescription}</p>${template==='blank'?'':`<a class="button" href="#${template==='portfolio'?'work':'more'}">Explore <span aria-hidden="true">↗</span></a>`}</section>${extra}</main><footer>Your next chapter starts here.</footer></body></html>`;
 const css=':root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18372e;background:#f3f1e8;font-synthesis:none}*{box-sizing:border-box}body{margin:0}a{color:inherit}header,main,footer{max-width:1160px;margin:auto;padding:32px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid #18372e22}header span,.eyebrow,article>span{font-size:11px;letter-spacing:.14em;font-weight:650}.brand{text-decoration:none;font-weight:750}.hero{padding:100px 0 90px;max-width:820px}h1{font-size:clamp(48px,8vw,94px);line-height:1.04;letter-spacing:-.065em;margin:22px 0;overflow-wrap:anywhere}.description{font-size:20px;line-height:1.7;max-width:620px;color:#50685e}.button{display:inline-flex;gap:40px;margin-top:24px;padding:15px 22px;border-radius:40px;background:#18372e;color:#fff;text-decoration:none}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{padding:36px;background:#e5e6da;border-radius:16px}article h2{font-size:28px;letter-spacing:-.04em}article p{line-height:1.65;color:#50685e}footer{font-size:13px;color:#50685e;padding-top:64px;padding-bottom:40px}@media(max-width:600px){header,main,footer{padding-left:24px;padding-right:24px}header>span{display:none}.hero{padding:70px 0}.grid{grid-template-columns:1fr}article{padding:26px}}';
 return bundleFromFiles([{path:'index.html',data:html},{path:'styles.css',data:css}]);
}
