import {useRef,useState,type SetStateAction} from 'react';
import type {CodeDraft,ContextFile,MuseBenchBridge} from '../shared/types';
const empty=():CodeDraft=>({text:'',files:[],mode:'chat'});
export function useCodeDraft(bridge:MuseBenchBridge|undefined,projectId:string|undefined,taskId:string|null,drafts:Record<string,CodeDraft>|undefined,onError:(error:string)=>void){
 const key=projectId?`${projectId}:${taskId??'new'}`:'unassigned';
 const [records,setRecords]=useState<Record<string,CodeDraft>>({});
 const draft=records[key]??drafts?.[key]??empty();
 const current=useRef({key,draft});current.current={key,draft};
 function setDraftFor(targetProject:string,targetTask:string|null,next:CodeDraft){
  const targetKey=`${targetProject}:${targetTask??'new'}`;setRecords(before=>({...before,[targetKey]:next}));
  if(bridge)void bridge.saveCodeDraft({projectId:targetProject,taskId:targetTask,...next}).catch(error=>onError(`Draft could not be saved: ${String(error)}`));
 }
 function update(patch:Partial<CodeDraft>){
  const next={...current.current.draft,...patch};current.current={key,draft:next};setRecords(before=>({...before,[key]:next}));
  if(bridge&&projectId)void bridge.saveCodeDraft({projectId,taskId,...next}).catch(error=>onError(`Draft could not be saved: ${String(error)}`));
 }
 const setText=(value:SetStateAction<string>)=>update({text:typeof value==='function'?value(current.current.draft.text):value});
 const setFiles=(files:ContextFile[])=>update({files});
 const setMode=(mode:'chat'|'plan')=>update({mode});
 return{message:draft.text,setMessage:setText,files:draft.files??[],setFiles,messageMode:draft.mode??'chat',setMessageMode:setMode,setDraftFor};
}
