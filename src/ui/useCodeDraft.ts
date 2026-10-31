import {useRef,useState,type SetStateAction} from 'react';
import type {CodeDraft,CodeImage,ContextFile,MuseBenchBridge,PromptShelfResult} from '../shared/types';
const empty=():CodeDraft=>({text:'',files:[],images:[],mode:'chat'});
export function useCodeDraft(bridge:MuseBenchBridge|undefined,projectId:string|undefined,taskId:string|null,drafts:Record<string,CodeDraft>|undefined,onError:(error:string)=>void){
 const key=projectId?`${projectId}:${taskId??'new'}`:'unassigned';
 const [records,setRecords]=useState<Record<string,CodeDraft>>({}),[fences,setFences]=useState<Record<string,boolean>>({}),[recoveryErrors,setRecoveryErrors]=useState<Record<string,string>>({});
 const recoveryReads=useRef(new Map<string,Promise<PromptShelfResult>>());
 const generations=useRef(new Map<string,number>()),locks=useRef(new Set<string>()),saves=useRef(new Map<string,Promise<void>>()),pendingSaves=useRef(new Map<string,Set<Promise<void>>>()),failures=useRef(new Map<string,unknown>()),previous=useRef(key);
 if(previous.current!==key){generations.current.set(previous.current,(generations.current.get(previous.current)??0)+1);generations.current.set(key,(generations.current.get(key)??0)+1);previous.current=key;}
 const generation=generations.current.get(key)??0,draft=records[key]??drafts?.[key]??empty();
 const current=useRef({key,draft});current.current={key,draft};
 const mutable=(targetKey=key,epoch=generation)=>!locks.current.has(targetKey)&&(generations.current.get(targetKey)??0)===epoch;
 const canMutate=()=>current.current.key===key&&mutable();
 function save(targetKey:string,targetProject:string,targetTask:string|null,next:CodeDraft){
  if(!bridge)return;
  const operation=bridge.saveCodeDraft({projectId:targetProject,taskId:targetTask,...next});saves.current.set(targetKey,operation);
  const pending=pendingSaves.current.get(targetKey)??new Set<Promise<void>>();pending.add(operation);pendingSaves.current.set(targetKey,pending);
  void operation.then(()=>{pending.delete(operation);if(saves.current.get(targetKey)===operation)failures.current.delete(targetKey);},error=>{pending.delete(operation);if(saves.current.get(targetKey)===operation)failures.current.set(targetKey,error);onError(`Draft could not be saved: ${String(error)}`);});
 }
 function setDraftFor(targetProject:string,targetTask:string|null,next:CodeDraft){
  const targetKey=`${targetProject}:${targetTask??'new'}`;if(locks.current.has(targetKey))return;
  if(targetKey===key&&!canMutate())return;
  if(current.current.key===targetKey)current.current={key:targetKey,draft:next};setRecords(before=>({...before,[targetKey]:next}));save(targetKey,targetProject,targetTask,next);
 }
 function update(patch:Partial<CodeDraft>){
  if(!canMutate())return;
  const next={...current.current.draft,...patch};current.current={key,draft:next};setRecords(before=>({...before,[key]:next}));
  if(projectId)save(key,projectId,taskId,next);
 }
 const setText=(value:SetStateAction<string>)=>{if(canMutate())update({text:typeof value==='function'?value(current.current.draft.text):value});};
 function appendDraftText(targetKey:string,excerpt:string){
  if(!projectId||targetKey!==key||current.current.key!==targetKey)throw Error('The selected chat changed. Choose the destination again.');
  if(!canMutate())throw Error('Wait for the saved prompt operation to finish.');
  const text=[current.current.draft.text,excerpt].filter(Boolean).join('\n\n');
  if(text.length>16000)throw Error('This excerpt and draft exceed 16,000 characters. Copy a smaller selection instead.');update({text});
 }
 function fence(targetKey:string){locks.current.add(targetKey);generations.current.set(targetKey,(generations.current.get(targetKey)??0)+1);setFences(before=>({...before,[targetKey]:true}));}
 function unlock(targetKey:string){locks.current.delete(targetKey);generations.current.set(targetKey,(generations.current.get(targetKey)??0)+1);setFences(before=>({...before,[targetKey]:false}));setRecoveryErrors(before=>{const next={...before};delete next[targetKey];return next;});}
 function reconcile(targetKey:string,next:CodeDraft|null){const value=next??empty();if(current.current.key===targetKey)current.current={key:targetKey,draft:value};setRecords(before=>({...before,[targetKey]:value}));}
 function recoverOwner(targetProject:string,targetTask:string|null){
  const targetKey=`${targetProject}:${targetTask??'new'}`,existing=recoveryReads.current.get(targetKey);if(existing)return existing;
  const operation=(async()=>{try{const result=await bridge!.readPromptShelf({projectId:targetProject,taskId:targetTask});reconcile(targetKey,result.draft);unlock(targetKey);return result;}catch(error){setRecoveryErrors(before=>({...before,[targetKey]:'The saved prompt result is unknown. Editing is paused until the current draft can be reloaded.'}));throw error;}})();
  recoveryReads.current.set(targetKey,operation);void operation.then(()=>recoveryReads.current.delete(targetKey),()=>recoveryReads.current.delete(targetKey));return operation;
 }
 async function shelfOperation(kind:'park'|'restore'|'remove',id?:string){
  if(!bridge||!projectId||!canMutate())throw Error('Wait for the saved prompt operation to finish.');
  const expected=current.current.draft;fence(key);const epoch=generations.current.get(key);let attempted=false;
  try{
   await Promise.all([...(pendingSaves.current.get(key)??[])]);if(failures.current.has(key))throw failures.current.get(key);
   const owner={projectId,taskId};let result:PromptShelfResult;attempted=true;
   if(kind==='park')result=await bridge.parkCodeDraft({...owner,expected});else if(kind==='restore')result=await bridge.restoreSavedPrompt({...owner,id:id!,expected});else result=await bridge.removeSavedPrompt({...owner,id:id!});
   if(kind!=='remove'&&current.current.key===key&&generations.current.get(key)===epoch)reconcile(key,result.draft);
   else if(kind!=='remove')setRecords(before=>{const next={...before};delete next[key];return next;});
   unlock(key);return result;
  }catch(error){
   if(attempted){try{await recoverOwner(projectId,taskId);}catch{/* Keep this owner fenced and expose explicit recovery. */}}
   else unlock(key);
   throw error;
  }
 }
 async function transferDraftTo(targetProject:string,targetTask:string,expected:CodeDraft){
  if(!bridge)throw Error('Draft storage unavailable.');const sourceKey=`${targetProject}:new`,targetKey=`${targetProject}:${targetTask}`;
  if(locks.current.has(sourceKey)||locks.current.has(targetKey))throw Error('Wait for draft recovery before creating this chat.');fence(sourceKey);fence(targetKey);let attempted=false;
  try{await Promise.all([...(pendingSaves.current.get(sourceKey)??[])]);if(failures.current.has(sourceKey))throw failures.current.get(sourceKey);attempted=true;const result=await bridge.transferCodeDraft({projectId:targetProject,taskId:null,targetTaskId:targetTask,expected});reconcile(sourceKey,null);reconcile(targetKey,result.draft);unlock(sourceKey);unlock(targetKey);return result;}
  catch(error){if(attempted){await Promise.allSettled([recoverOwner(targetProject,null),recoverOwner(targetProject,targetTask)]);}else{unlock(sourceKey);unlock(targetKey);}throw error;}
 }

 return{transferDraftTo,draftRecoveryError:recoveryErrors[key],recoverDraft:()=>projectId?recoverOwner(projectId,taskId):Promise.reject(Error('Choose a project.')),draftKey:key,draftLocked:!!fences[key],canMutate,shelfOperation,images:draft.images??[],setImages:(images:CodeImage[])=>update({images}),message:draft.text,setMessage:setText,files:draft.files??[],setFiles:(files:ContextFile[])=>update({files}),messageMode:draft.mode??'chat',setMessageMode:(mode:'chat'|'plan')=>update({mode}),setDraftFor,appendDraftText};
}
