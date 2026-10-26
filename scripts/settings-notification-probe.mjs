import {_electron as electron} from 'playwright';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
await mkdir('artifacts/settings-notification',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/settings-notification','probe-'));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
for(const key of Object.keys(env)){if(key.toUpperCase()==='PATH')env[key]=env[key].split(';').filter(folder=>!/muse/i.test(folder)).join(';');if(key.toUpperCase()==='LOCALAPPDATA')env[key]=env.MUSEBENCH_DATA_DIR;}
const app=await electron.launch({cwd:process.cwd(),executablePath:path.resolve('release/win-unpacked/MuseBench.exe'),args:[],env});
try{
 await app.firstWindow();
 const result=await app.evaluate(async({Notification,BrowserWindow,app})=>{
  if(!Notification.isSupported())return{supported:false};
  // This fixed test message contains no account, prompt or project data.
  const {createRunNotifier}=process.getBuiltinModule('node:module').createRequire(app.getAppPath()+'/package.json')('./electron/notifications.mjs');
  BrowserWindow.getAllWindows()[0].minimize();
  return new Promise(resolve=>{
   let notification;const timer=setTimeout(()=>{notification?.close();resolve({supported:true,delivery:'timeout'});},6000);
   const notifier=createRunNotifier({isFocused:()=>false,send:options=>{
    notification=new Notification(options);
    notification.once('show',()=>{clearTimeout(timer);notification.close();resolve({supported:true,delivery:'show event',genericText:options.body==='Muse Code finished a task.',silent:options.silent});});
    notification.once('failed',(_event,error)=>{clearTimeout(timer);resolve({supported:true,delivery:'failed',error});});
    notification.show();
   }});
   notifier.configure({completion:true,attention:false,sound:false});
   notifier.observe({task:{id:'test',runs:[{id:'test',status:'working'}]}});
   notifier.observe({task:{id:'test',runs:[{id:'test',status:'completed'}]}});
  });
 });
 await writeFile(path.join(output,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),...result},null,2));console.log(JSON.stringify({output,...result}));
 if(result.delivery!=='show event')process.exitCode=1;
}finally{await app.close();}
