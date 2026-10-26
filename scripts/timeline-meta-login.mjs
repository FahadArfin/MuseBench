import {_electron as electron} from 'playwright';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const env={...process.env};for(const key of ['MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR','MUSEBENCH_DEV','ELECTRON_RUN_AS_NODE'])delete env[key];
const app=await electron.launch({colorScheme:null,...(process.env.MUSEBENCH_TIMELINE_SOURCE?{}:{executablePath:path.resolve('release/win-unpacked/MuseBench.exe')}),args:process.env.MUSEBENCH_TIMELINE_SOURCE?['.']:[],env});
const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();
await page.getByRole('navigation',{name:'Meta AI navigation',exact:true}).getByRole('button',{name:'Chat',exact:true}).click();
console.log('Meta AI Chat is open for the user to sign in and open an existing conversation.');
// Poll only non-content DOM structure. No chat text, account IDs, URLs or secrets.
let signature='';
for(let i=0;i<600;i++){
 if(!app.process()||app.process().exitCode!==null)break;
 const data=await app.evaluate(async({BrowserWindow})=>{
  const wc=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow())?.contentView.children.map(v=>v.webContents).find(w=>w&&/^https:\/\/(www\.)?meta\.ai\//.test(w.getURL()));
  if(!wc)return null;
  if(!wc.__timelineOrigins){wc.__timelineOrigins=[];for(const event of ['will-navigate','will-redirect'])wc.on(event,(_event,url)=>{try{const origin=new URL(_event.url??url).origin;if(!wc.__timelineOrigins.includes(origin))wc.__timelineOrigins.push(origin);}catch{}});}
  if(!wc.__timelineLoginClicked){wc.__timelineLoginClicked=await wc.executeJavaScript(`(()=>{const button=document.querySelector('[data-testid=login-button]');if(!button)return false;button.click();return true;})()`).catch(()=>false);}

  return wc.executeJavaScript('('+function(){
   const markers=new Set();for(const e of document.querySelectorAll('[data-testid],[data-message-role],[data-message-author-role],[data-pel-click]'))for(const a of e.attributes)if(/^data-(testid|message-role|message-author-role|pel-click)$/.test(a.name)&&a.value.length<90)markers.add(a.name+'='+a.value.replace(/[0-9]{4,}/g,'ID'));
   return {composer:document.querySelectorAll('textarea,[contenteditable="true"]').length,logs:document.querySelectorAll('[role="log"]').length,markers:[...markers].slice(0,200)};
  }.toString()+')()').then(result=>({...result,redirectOrigins:wc.__timelineOrigins})).catch(()=>null);
 }).catch(()=>null);
 if(data&&JSON.stringify(data)!==signature){signature=JSON.stringify(data);await writeFile('artifacts/timeline-meta-structure.json',JSON.stringify(data,null,2));console.log(signature);}
 await new Promise(r=>setTimeout(r,1000));
}
await app.close().catch(()=>{});
