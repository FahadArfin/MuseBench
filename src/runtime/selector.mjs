import {createExecRuntime,checkConfiguration} from './exec.mjs';
import {createRuntime} from './index.mjs';
/** One adapter per chat; transport/access choices are never inherited by another chat. */
export function createCodeRuntime({execFactory,mspFactory,verifyConfiguration=checkConfiguration,...options}={}){
 const factories={exec:execFactory??(()=>createExecRuntime(options)),msp:mspFactory??(()=>createRuntime(options))};
 let kind='exec',runtime=factories.exec(),unsubscribe,workspaceRoot;const listeners=new Set();
 const snapshot=()=>({...runtime.snapshot(),interactiveAvailable:true});
 const emit=()=>{for(const fn of listeners)fn(snapshot());};const subscribe=()=>{unsubscribe=runtime.subscribe(emit);};subscribe();
 const verify=()=>kind==='msp'?verifyConfiguration({environment:options.environment??process.env,workspaceRoot,extensionReview:options.extensionReview}):Promise.resolve();
 const api={snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async connect(input={}){
  const selected=input.transport??kind;if(!factories[selected])throw Error('Unsupported connection mode.');
  const s=runtime.snapshot();if(s.permissionVerified||!['unavailable','closed'].includes(s.status)||s.cleanup==='pending'||s.cleanup==='unconfirmed')throw Error('Disconnect the current connection before changing modes.');
  if(selected==='msp'&&input.fullAccess!==true)throw Error('Interactive Windows mode requires explicit Full access.');
  if(selected!==kind){unsubscribe?.();runtime=factories[selected]();kind=selected;subscribe();}workspaceRoot=input.workspaceRoot;await verify();await runtime.connect(input);emit();return snapshot();
 },async disconnect(){await runtime.disconnect();emit();return snapshot();},async close(){await runtime.disconnect();unsubscribe?.();listeners.clear();}};
 for(const name of ['send','steer','answerInput','decide','refreshModels','compact','childControl'])api[name]=async(...args)=>{if(typeof runtime[name]!=='function')throw Error('This control is unavailable on the current connection.');if(name==='send')await verify();return runtime[name](...args);};
 return api;
}
