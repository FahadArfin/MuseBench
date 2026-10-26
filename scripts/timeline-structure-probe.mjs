import {_electron as electron} from 'playwright';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
if(process.env.MUSEBENCH_VERIFY_SAVED_SESSION!=='1')throw Error('Saved session inspection requires explicit opt in.');
const env={...process.env};for(const key of ['MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR','MUSEBENCH_DEV','ELECTRON_RUN_AS_NODE'])delete env[key];
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/MuseBench.exe'),args:[],env});
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>Boolean(window.musebench));
 await page.evaluate(()=>window.musebench.personal({type:'navigate',destination:'chat'}));
 await new Promise(r=>setTimeout(r,6500));
 const structure=await app.evaluate(async({BrowserWindow})=>{
  const wc=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).contentView.children.map(v=>v.webContents).find(w=>w&&/^https:\/\/(www\.)?meta\.ai\//.test(w.getURL()));
  if(!wc)return {available:false};
  return wc.executeJavaScript('('+function(){
   const markers=new Set();
   for(const e of document.querySelectorAll('[data-testid],[data-message-role],[data-message-author-role],[data-pel-click]'))for(const a of e.attributes)if(/^data-(testid|message-role|message-author-role|pel-click)$/.test(a.name)&&a.value.length<90)markers.add(a.name+'='+a.value.replace(/[0-9]{4,}/g,'ID'));
   return {available:true,main:!!document.querySelector('main,[role="main"]'),logs:document.querySelectorAll('[role="log"]').length,composer:document.querySelectorAll('textarea,[contenteditable="true"]').length,markers:[...markers].slice(0,100),messageLabels:[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).filter(v=>/^(You said|Meta AI said|User message|Assistant message|Chat message|Message from you|Message from Meta AI)/i.test(v)).map(v=>v.split(':')[0]).slice(0,10)};
  }.toString()+')()');
 });
 await writeFile('artifacts/timeline-meta-structure.json',JSON.stringify(structure,null,2));console.log(JSON.stringify(structure));
}finally{await app.close();}
