import {randomUUID} from 'node:crypto';
const types=new Set(['open-chat','new-chat','feedback','settings']);
export function createTrayNavigation({openWindow,send,onFailure=()=>{}}){
 let pending=null,next=null,ready=false,delivered=false,closed=false;
 const flush=()=>{if(!closed&&ready&&pending&&!delivered){delivered=true;try{send(structuredClone(pending));}catch{delivered=false;}}};
 const fail=()=>{try{onFailure('Could not open that tray action. Finish the current app operation and try again.');}catch{}};
 return{async request(command){
  if(closed)throw Error('MuseBench is closing.');
  if(!command||!types.has(command.type)||Object.keys(command).some(k=>!['type',...(command.type==='open-chat'?['taskId','activityIds']:[])].includes(k)))throw Error('Invalid tray command.');
  if(command.type==='open-chat'&&(typeof command.taskId!=='string'||!command.taskId||command.taskId.length>200||!Array.isArray(command.activityIds)||command.activityIds.length>200||command.activityIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))))throw Error('Invalid tray chat.');
  const ticket={id:randomUUID(),command:structuredClone(command)};
  if(pending&&delivered)next=ticket;else{pending=ticket;next=null;}
  try{await openWindow();flush();}catch{if(pending?.id===ticket.id){pending=null;delivered=false;}if(next?.id===ticket.id)next=null;fail();}
 },ready(){ready=true;flush();},detach(){ready=false;delivered=false;},ack(value){
  if(!value||Object.keys(value).some(k=>!['id','handled'].includes(k))||typeof value.handled!=='boolean'||value.id!==pending?.id)return false;
  if(!value.handled)fail();pending=next;next=null;delivered=false;flush();return true;
 },close(){closed=true;pending=null;next=null;ready=false;}};
}
