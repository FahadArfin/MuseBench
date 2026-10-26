import {_electron as electron} from 'playwright';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('artifacts/preview-snapshots');await mkdir(output,{recursive:true});
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR'])delete env[key];
// This deliberately uses the owner's existing profile, read-only. Close the
// normal app first; a concurrent instance would retain the single-instance lock.
const executable=process.env.MUSEBENCH_EXECUTABLE;
const app=await electron.launch({...(executable?{executablePath:executable,args:[]}:{args:['.']}),env,timeout:20000});
const manifest={version:1,pages:{}},images=new Map();
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();
 for(const key of ['bot','ideas','goals','chat','media','artifacts','scheduled','vibes','search']){
  const command=['bot','ideas','goals'].includes(key)?{type:'navigate',destination:key}:{type:'metaAction',action:key==='chat'?'newChat':key};
  await page.evaluate(command=>window.musebench.personal(command),command);
  let state;
  for(let i=0;i<100;i++){state=await page.evaluate(()=>window.musebench.personalState());if(state.visible&&!state.loading&&!state.error)break;await page.waitForTimeout(100);}
  // Native navigation can finish before the provider hydrates its content and
  // our sidebar metadata. Give those read-only adapters time to settle.
  await page.waitForTimeout(1000);
  if(key==='bot')await page.evaluate(()=>window.musebench.personal({type:'refreshLibrary'}));
  for(let i=0;i<100;i++){
   state=await page.evaluate(()=>window.musebench.personalState());
   const ready=key==='scheduled'?state.schedules?.status==='ready':key==='bot'?Boolean(state.agentProfile?.name&&state.agentProfile?.avatar):true;
   if(ready&&!state.loading&&!state.error)break;
   await page.waitForTimeout(200);
  }
  const capture=await app.evaluate(async({BrowserWindow})=>{
   const host=BrowserWindow.getAllWindows().find(window=>!window.getParentWindow());
   const view=host?.contentView.children.find(view=>view.webContents&&view.getVisible());
   if(!view)return null;
   const url=new URL(view.webContents.getURL());if(!['https://www.meta.ai','https://meta.ai','https://muse.ai'].includes(url.origin))return null;
   await view.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
   const image=await view.webContents.capturePage();return {bytes:image.toPNG().toString('base64'),size:image.getSize(),origin:url.origin};
  });
  if(!capture)throw Error(`Could not capture the official ${key} page; previous manifest was preserved.`);
  state=await page.evaluate(()=>window.musebench.personalState());
  const file=`${key}.png`;images.set(file,Buffer.from(capture.bytes,'base64'));
  manifest.pages[key]={file,capturedAt:new Date().toISOString(),...capture.size,origin:capture.origin,personal:{agentProfile:state.agentProfile??null,library:state.library,schedules:state.schedules??null}};
  console.log(`Captured ${key} (${capture.size.width} × ${capture.size.height}) locally`);
 }
 // Do not replace earlier captures until every requested page was captured.
 for(const [file,bytes] of images)await writeFile(path.join(output,file),bytes);
 await writeFile(path.join(output,'manifest.tmp'),JSON.stringify(manifest,null,2));await rename(path.join(output,'manifest.tmp'),path.join(output,'manifest.json'));
 console.log('Saved private desktop snapshots. No messages or scheduling changes were submitted.');
}finally{await app.close();}
