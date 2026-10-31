import {useRef,useState,type SetStateAction} from 'react';
import type {CodeDraft,CodeImage,ContextFile,MuseBenchBridge,PromptShelfResult} from '../shared/types';
const empty=():CodeDraft=>({text:'',files:[],images:[],mode:'chat'});
export function useCodeDraft(bridge:MuseBenchBridge|undefined,projectId:string|undefined,taskId:string|null,drafts:Record<string,CodeDraft>|undefined,onError:(error:string)=>void){
 const key=projectId?`${projectId}:${taskId??'new'}`:'unassigned';
 const [records,setRecords]=useState<Record<string,CodeDraft>>({}),[fences,setFences]=useState<Record<string,boolean>>({});
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
 async function shelfOperation(kind:'park'|'restore'|'remove',id?:string){
  if(!bridge||!projectId||!canMutate())throw Error('Wait for the saved prompt operation to finish.');
  const expected=current.current.draft,epoch=generation+1;generations.current.set(key,epoch);locks.current.add(key);setFences(before=>({...before,[key]:true}));
  try{
   await Promise.all([...(pendingSaves.current.get(key)??[])]);if(failures.current.has(key))throw failures.current.get(key);
   const owner={projectId,taskId};let result:PromptShelfResult;
   if(kind==='park')result=await bridge.parkCodeDraft({...owner,expected});else if(kind==='restore')result=await bridge.restoreSavedPrompt({...owner,id:id!,expected});else result=await bridge.removeSavedPrompt({...owner,id:id!});
   if(kind!=='remove'&&current.current.key===key&&generations.current.get(key)===epoch){const next=result.draft??empty();current.current={key,draft:next};setRecords(before=>({...before,[key]:next}));}
   else if(kind!=='remove')setRecords(before=>{const next={...before};delete next[key];return next;});
   return result;
  }finally{locks.current.delete(key);generations.current.set(key,(generations.current.get(key)??epoch)+1);setFences(before=>({...before,[key]:false}));}
 }
 return{draftKey:key,draftLocked:!!fences[key],canMutate,shelfOperation,images:draft.images??[],setImages:(images:CodeImage[])=>update({images}),message:draft.text,setMessage:setText,files:draft.files??[],setFiles:(files:ContextFile[])=>update({files}),messageMode:draft.mode??'chat',setMessageMode:(mode:'chat'|'plan')=>update({mode}),setDraftFor,appendDraftText};
}
