import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

/** Owns only lifecycle preference/tray. Work owners and authentication stay in main. */
export async function createBackgroundEngine({dataDir,createTray,openWindow,windowOpen,quit,isBusy,onBlocked=()=>{},save}){
 const file=path.join(dataDir,'background-engine.json');
 let enabled=false,tray=null,closed=false,pending=0,queue=Promise.resolve(),completion;
 const persist=save??(async value=>{const tmp=file+'.'+randomUUID();try{await writeFile(tmp,JSON.stringify({version:1,enabled:value}),{flag:'wx',mode:0o600});await rename(tmp,file);}finally{await rm(tmp,{force:true});}});
 const open=()=>Promise.resolve().then(()=>{if(!closed)return openWindow();}).catch(()=>onBlocked('Could not reopen MuseBench. Try opening it from its app shortcut.'));
 const makeTray=()=>createTray({open,quit:()=>{if(!closed)quit();}});
 try{const saved=JSON.parse(await readFile(file,'utf8'));if(saved.version===1&&saved.enabled===true){tray=makeTray();enabled=true;}}catch{/* Default off if storage or the tray is unavailable. */}
 const snapshot=()=>({enabled,running:!closed,windowOpen:windowOpen()});
 return{snapshot,command(command){
  if(!command||typeof command!=='object'||Array.isArray(command)||!['status','set'].includes(command.type)||Object.keys(command).some(k=>!['type',...(command.type==='set'?['enabled']:[])].includes(k))||command.type==='set'&&typeof command.enabled!=='boolean')return Promise.reject(Error('Invalid background setting.'));
  if(command.type==='status')return Promise.resolve(snapshot());
  if(closed)return Promise.reject(Error('MuseBench is closing.'));
  pending++;
  const operation=queue.then(async()=>{
   if(closed)throw Error('MuseBench is closing.');
   if(command.enabled===enabled)return snapshot();
   if(command.enabled){
    let next;try{next=makeTray();if(!next)throw Error();await persist(true);}catch{next?.destroy();throw Error('Could not enable background mode. The system tray or preference storage is unavailable.');}
    tray=next;enabled=true;
   }else{
    // Keep the tray and preference if opening or saving fails.
    if(!windowOpen())await openWindow();
    if(!windowOpen())throw Error('Open MuseBench before turning off background mode.');
    await persist(false);enabled=false;tray?.destroy();tray=null;
   }
   return snapshot();
  }).finally(()=>pending--);queue=operation.catch(()=>{});return operation;
 },windowClosed(){if(!closed&&!enabled)quit();},beforeQuit(event){
  if(closed)return true;
  let busy=true;try{busy=pending>0||isBusy();}catch{/* Unknown ownership must not cancel active work. */}
  if(busy){event.preventDefault();onBlocked('Finish or stop active work before quitting MuseBench.');return false;}return true;
 },close(){
  if(completion)return completion;closed=true;completion=queue.finally(()=>{tray?.destroy();tray=null;});return completion;
 }};
}
