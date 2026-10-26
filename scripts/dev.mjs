import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import electronPath from 'electron';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const vite = spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',windowsHide:true});
let desktop;
const stop=()=>{desktop?.kill();vite.kill();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try {
  let ready=false;
  for(let i=0;i<80;i++){if(vite.exitCode!==null)throw Error('Development server exited.');try{ready=(await fetch('http://127.0.0.1:4318')).ok;}catch{}if(ready)break;await delay(250);}
  if(!ready)throw Error('Development server did not start.');
  desktop=spawn(electronPath,['.'],{stdio:'inherit',env:{...env,MUSEBENCH_DEV:'1'},windowsHide:true});
  desktop.on('exit',code=>{vite.kill();process.exitCode=code??0;});
}catch(error){stop();console.error(error.message);process.exitCode=1;}
