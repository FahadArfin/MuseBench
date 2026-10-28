// Isolated protocol fixture: no provider login, model runs or user project files.
import {createMobileHost} from '../electron/mobile-host.mjs';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dataDir=await mkdtemp(path.join(tmpdir(),'muse-emulator-'));let count=0;
const host=await createMobileHost({dataDir,port:43191,
 protection:{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()},
 service:{snapshot:()=>({name:'Emulator desktop',testCommandCount:count,chats:[{id:'chat-one',title:'Emulator chat'}]}),readChat:()=>({messages:[]}),command:async()=>{count++;}},
});
await host.command({type:'start'});const state=await host.command({type:'pair',address:'127.0.0.1'});
const payload=JSON.parse(Buffer.from(new URL(state.pairing.link).searchParams.get('data'),'base64url'));
payload.url=payload.url.replace('127.0.0.1','10.0.2.2');
await mkdir('artifacts/mobile-emulator',{recursive:true});
await writeFile('artifacts/mobile-emulator/pair-link.txt','musebench://pair?data='+Buffer.from(JSON.stringify(payload)).toString('base64url'));
console.log('Isolated emulator desktop fixture ready.');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await host.close();process.exit(0);});
