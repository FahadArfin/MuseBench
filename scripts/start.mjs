import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import electron from 'electron';
const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;delete environment.MUSEBENCH_DEV;
const child=spawn(electron,['.'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:environment,windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
