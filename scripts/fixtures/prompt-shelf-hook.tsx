import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {useCodeDraft} from '../../src/ui/useCodeDraft';
export async function exerciseDraftFence(){
 let hook:any,owner='first',saved:any[]=[],shelfCalls=0,releaseSave:()=>void,releaseShelf:()=>void;
 const errors:string[]=[],empty={text:'',files:[],images:[],mode:'chat'},drafts:any={};
 const bridge:any={removeSavedPrompt:async()=>({draft:null,entries:[]}),saveCodeDraft:async(input:any)=>{saved.push(input);await new Promise<void>(resolve=>releaseSave=resolve);},parkCodeDraft:async()=>{shelfCalls++;drafts['project:first']=empty;await new Promise<void>(resolve=>releaseShelf=resolve);return{draft:null,entries:[]};}};
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 function Harness(){hook=useCodeDraft(bridge,'project',owner,drafts,error=>errors.push(error));return null;}
 const render=()=>flushSync(()=>root.render(<Harness/>));render();
 const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
 try{
  flushSync(()=>hook.setMessage('Held draft'));const old=hook;
  let pending:Promise<any>;flushSync(()=>{pending=hook.shelfOperation('park');});
  const attempt=async()=>{flushSync(()=>{old.setMessage('Typing');old.setFiles([{path:'late.txt',hash:'a'.repeat(64)}]);old.setImages([{id:'b'.repeat(64),name:'late.png',mime:'image/png',bytes:1}]);old.setMessageMode('plan');old.setDraftFor('project','first',{...empty,text:'Programmatic'});});let rejected=false;try{old.appendDraftText('project:first','Quote');}catch{rejected=true;}check(rejected,'Quote must reject during fence');check(!old.canMutate(),'Send/queue admission must be fenced');await hook.shelfOperation('park').then(()=>{throw Error('Second shelf operation was admitted');},()=>{});check(saved.length===1,'A blocked mutation wrote a draft');};
  await attempt();check(shelfCalls===0,'Park must wait for accepted saves');releaseSave!();await new Promise(resolve=>setTimeout(resolve,0));check(shelfCalls===1,'Park starts after drain');await attempt();
  owner='second';render();flushSync(()=>hook.setMessage('Other owner'));releaseSave!();releaseShelf!();await pending!;render();check(hook.message==='Other owner','Late shelf reply overwrote another owner');
  const count=saved.length;old.setImages([{id:'b'.repeat(64),name:'late.png',mime:'image/png',bytes:1}]);old.setFiles([{path:'late.txt',hash:'a'.repeat(64)}]);check(saved.length===count,'Completion from old generation mutated a draft');
  owner='first';render();check(hook.message==='','Returning owner must reconcile durable state without resurrecting old text');check(saved.length===2,'Reconciliation blindly resaved');check(errors.length===0,'Unexpected hook save error');
  flushSync(()=>hook.setMessageMode('plan'));releaseSave!();await hook.shelfOperation('remove','saved-slot');render();check(hook.messageMode==='plan','Removing a shelf entry must preserve current empty draft mode');
  return{checks:8,savedCalls:saved.length,shelfCalls};
 }finally{root.unmount();node.remove();}
}
export async function exerciseMultipleSaveDrain(){
 let hook:any,releaseFirst:()=>void,saves=0,shelfCalls=0;const node=document.createElement('div');document.body.append(node);const root=createRoot(node),bridge:any={saveCodeDraft:async()=>{if(++saves===1)await new Promise<void>(resolve=>releaseFirst=resolve);},parkCodeDraft:async()=>{shelfCalls++;return{draft:null,entries:[]};}};
 function Harness(){hook=useCodeDraft(bridge,'project','chat',{},()=>{});return null;}
 try{flushSync(()=>root.render(<Harness/>));flushSync(()=>hook.setMessage('First'));flushSync(()=>hook.setMessage('Second'));const pending=hook.shelfOperation('park');await new Promise(resolve=>setTimeout(resolve,0));if(shelfCalls!==0)throw Error('Shelf must drain every accepted save, including an earlier delayed acknowledgement');releaseFirst!();await pending;return{saves,shelfCalls};}finally{releaseFirst?.();root.unmount();node.remove();}
}
export async function exerciseUnknownShelfOutcome(){
 const results=[];
 for(const failFirstRead of [false,true]){
  let hook:any,owner='first',drafts:any={'project:first':{text:'Occupied text',files:[],images:[],mode:'chat'}},durable:any={text:'Only saved copy',files:[],images:[],mode:'plan'},reads=0,writes=0,failReads=failFirstRead;
  const bridge:any={saveCodeDraft:async(input:any)=>{writes++;if(input.taskId==='first')durable=input;else drafts['project:'+input.taskId]=input;},restoreSavedPrompt:async()=>{throw Error('Reply lost after commit');},readPromptShelf:async()=>{reads++;if(failReads)throw Error('Recovery unavailable');return{draft:durable,entries:[{id:'slot',draft:drafts['project:first']}]};}};
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);function Harness(){hook=useCodeDraft(bridge,'project',owner,drafts,()=>{});return null;}const render=()=>flushSync(()=>root.render(<Harness/>));
  try{render();await hook.shelfOperation('restore','slot').catch(()=>{});render();if(failFirstRead){if(!hook.draftLocked||hook.canMutate())throw Error('Unknown state unlocked despite failed recovery');hook.setMessage('Must not overwrite');if(writes)throw Error('Unreconciled owner accepted a write');owner='second';render();flushSync(()=>hook.setMessage('Other owner draft'));if(hook.message!=='Other owner draft')throw Error('Other owner unnecessarily blocked');owner='first';render();if(!hook.draftLocked)throw Error('Navigation forgot unresolved owner fence');failReads=false;await hook.recoverDraft();render();}
   if(hook.message!=='Only saved copy'||hook.draftLocked)throw Error('Commit-then-reject did not reconcile authoritative draft');const before=writes;flushSync(()=>hook.setMessage(text=>text+' edited'));if(durable.text!=='Only saved copy edited'||writes!==before+1)throw Error('Next edit destroyed recovered prompt');results.push({failFirstRead,reads,writes});
  }finally{root.unmount();node.remove();}
 }
 return results;
}
export async function exercisePreviewRecovery(){
 const {createPreviewBridge}=await import('../../src/preview/bridge');const b=createPreviewBridge(),state=await b.dispatch({type:'newTask',request:'Preview recovery owner',mode:'manual'}),owner={projectId:state.activeProject!.id,taskId:state.task!.id},saved={text:'Preview only saved copy',files:[],images:[],mode:'plan' as const},occupied={text:'Preview occupied',files:[],images:[],mode:'chat' as const};await b.saveCodeDraft({...owner,...saved});const parked=await b.parkCodeDraft({...owner,expected:saved});await b.saveCodeDraft({...owner,...occupied});const bridge={...b,restoreSavedPrompt:async(input:any)=>{await b.restoreSavedPrompt(input);throw Error('Preview reply lost after commit');}},node=document.createElement('div');document.body.append(node);const root=createRoot(node);let hook:any;function Harness(){hook=useCodeDraft(bridge,owner.projectId,owner.taskId,{[owner.projectId+':'+owner.taskId]:occupied},()=>{});return null;}
 try{flushSync(()=>root.render(<Harness/>));await hook.shelfOperation('restore',parked.entries[0].id).catch(()=>{});flushSync(()=>root.render(<Harness/>));if(hook.message!=='Preview only saved copy'||hook.draftLocked)throw Error('Preview unknown outcome did not recover');flushSync(()=>hook.setMessage(text=>text+' edited'));await new Promise(resolve=>setTimeout(resolve,0));const durable=await b.readPromptShelf(owner);if(durable.draft?.text!=='Preview only saved copy edited')throw Error('Preview edit destroyed saved copy');return{recovered:true};}finally{root.unmount();node.remove();}
}
