export const HOOK_EVENTS=['UserPromptSubmit','Stop'];
export function validateHooks(items){
 if(!Array.isArray(items)||items.length>6)throw Error('Use at most six project hooks.');const ids=new Set();
 return items.map(item=>{
  if(!item||typeof item!=='object'||Object.keys(item).some(k=>!['id','event','command','timeout','enabled'].includes(k))||typeof item.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(item.id)||ids.has(item.id)||!HOOK_EVENTS.includes(item.event)||typeof item.command!=='string'||!item.command.trim()||item.command.length>1500||/[\r\n\0]/.test(item.command)||!Number.isInteger(item.timeout)||item.timeout<1||item.timeout>30||typeof item.enabled!=='boolean')throw Error('Hooks need a unique name, supported event, one-line command and 1–30 second timeout.');
  ids.add(item.id);return{id:item.id,event:item.event,command:item.command.trim(),timeout:item.timeout,enabled:item.enabled};
 });
}
export function nativeHooks(items,platform){
 if(!['win32','linux','darwin'].includes(platform))throw Error('A supported desktop platform is required for native hooks.');
 const commandKey=platform==='win32'?'commandWindows':'command',result={};
 for(const item of validateHooks(items))if(item.enabled){result[item.event]??=[];result[item.event].push({hooks:[{type:'command',[commandKey]:item.command,timeout:item.timeout}]});}
 return result;
}
