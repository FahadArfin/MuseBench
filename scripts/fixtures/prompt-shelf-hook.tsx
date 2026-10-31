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
