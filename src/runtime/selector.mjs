import {createExecRuntime} from './exec.mjs';
import {createRuntime} from './index.mjs';
import {readRuntimeStatus} from './status.mjs';
/** One adapter per chat; transport/access choices are never inherited by another chat. */
export function createCodeRuntime({execFactory,mspFactory,...options}={}){
 const factories={exec:execFactory??(()=>createExecRuntime(options)),msp:mspFactory??(()=>createRuntime(options))};
 let kind='exec',runtime=factories.exec(),unsubscribe;const listeners=new Set();
 const snapshot=()=>({...runtime.snapshot(),interactiveAvailable:true});
 const emit=()=>{for(const fn of listeners)fn(snapshot());};const subscribe=()=>{unsubscribe=runtime.subscribe(emit);};subscribe();
 const api={snapshot,statusSnapshot:()=>readRuntimeStatus(runtime),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async connect(input={}){
  const selected=input.transport??kind;if(!factories[selected])throw Error('Unsupported connection mode.');
  if(input.toolDiscovery!==undefined&&selected!=='msp')throw Error('On-demand tools require an interactive connection.');
  const s=runtime.snapshot();if(s.permissionVerified||!['unavailable','closed'].includes(s.status)||s.cleanup==='pending'||s.cleanup==='unconfirmed')throw Error('Disconnect the current connection before changing modes.');
  if(selected==='msp'&&input.fullAccess!==true)throw Error('Interactive Windows mode requires explicit Full access.');
  if(selected!==kind){unsubscribe?.();runtime=factories[selected]();kind=selected;subscribe();}await runtime.connect(input);emit();return snapshot();
 },async disconnect(){await runtime.disconnect();emit();return snapshot();},async close(){await runtime.disconnect();unsubscribe?.();listeners.clear();}};
 api.inspectDiscoverySources=root=>{if(typeof options.discoveryMcp?.inspect!=='function')throw Error('On-demand source inspection is unavailable.');return options.discoveryMcp.inspect(root);};
 api.discoveryEpoch=()=>runtime.discoveryEpoch?.()??0;
 for(const name of ['forkSession','send','steer','answerInput','decide','refreshModels','compact','childControl','inspectChild','readMcpServers'])api[name]=async(...args)=>{if(typeof runtime[name]!=='function')throw Error('This control is unavailable on the current connection.');return runtime[name](...args);};
 return api;
}
