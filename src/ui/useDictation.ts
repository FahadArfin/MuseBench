import {useCallback,useEffect,useRef,useState,useSyncExternalStore,type Dispatch,type SetStateAction} from 'react';
import type {DictationState} from '../shared/types';
import {appendDictation} from '../shared/dictation-budget.mjs';
import {createDictationRecovery} from '../shared/dictation-recovery.mjs';
const empty:DictationState={id:null,status:'idle',available:null,language:null,text:'',error:null};
// This origin's existing persistent profile survives BrowserWindow destruction
// and app restart. Storage failures retain the pending text and expose recovery.
const recovery=createDictationRecovery();let recoveryQueued=false;
// Several composers and annotation editors can be mounted together. Only the
// hook that started the native capture may issue its global cancel command.
let recordingOwner:symbol|null=null;
function queueRecovery(){if(!recoveryQueued){recoveryQueued=true;queueMicrotask(()=>{recoveryQueued=false;recovery.flush();});}}
export function useDictation(active:boolean,context:string,append:Dispatch<SetStateAction<string>>,maxLength=16000) {
 recovery.load();
 const [state,setState]=useState(empty),[hint,setHint]=useState('');
 const overflow=useSyncExternalStore(recovery.subscribe,()=>recovery.text(context),()=> ''),recoveryError=useSyncExternalStore(recovery.subscribe,recovery.error,()=> '');
 const capture=useRef<{id:string|null;text:string;epoch:number;context:string;pending:Map<string,DictationState>}|null>(null),epoch=useRef(0),owner=useRef(Symbol('dictation-owner'));
 const latest=useRef({append,active,context,maxLength});latest.current={append,active,context,maxLength};
 const insertSpeech=useCallback((speech:string,target:string,token:number)=>{
  if(!speech)return;
  const entry=recovery.retain(target,speech);
  try{latest.current.append(text=>{
   // Updaters can run later or more than once. Replace this receipt rather than
   // concatenating excess in an updater, and notify outside React's render.
   if(token!==epoch.current||!latest.current.active||latest.current.context!==target)return text;
   const next=appendDictation(text,speech);let end=Math.max(text.length,latest.current.maxLength);
   if(end<next.text.length&&/[\uD800-\uDBFF]/.test(next.text[end-1])&&/[\uDC00-\uDFFF]/.test(next.text[end]))end--;
   entry.text=next.text.slice(end)+next.remainder;queueRecovery();return next.text.slice(0,end);
  });}catch{setHint('Speech is kept below because it could not be added to the message.');}
  recovery.flush();
 },[]);
 const cancel=useCallback(()=>{const owned=!!capture.current&&recordingOwner===owner.current;epoch.current++;capture.current=null;setState(s=>({...s,status:'idle',text:'',error:null}));setHint('');if(owned){recordingOwner=null;void window.musebench?.dictation('cancel').catch(()=>{});}},[]);
 useEffect(()=>{
  const bridge=window.musebench;if(!bridge?.dictation||!bridge.onDictation)return;
  void bridge.dictation('status').then(value=>setState(current=>({...current,available:value.available,language:value.language}))).catch(()=>{});
  return bridge.onDictation(value=>{
   // Availability belongs to the device, including refreshes while Settings is open.
   setState(current=>current.available===value.available&&current.language===value.language?current:{...current,available:value.available,language:value.language});
   const current=capture.current;
   if(!current||!latest.current.active||current.context!==latest.current.context)return;
   // Native events and IPC replies use different delivery paths. Buffer only
   // until the start reply identifies this capture, then select its exact ID.
   if(current.id===null){if(value.id)current.pending.set(value.id,value);return;}
   if(value.id!==current.id)return;
   if(value.text.startsWith(current.text)&&value.text.length>current.text.length){const delta=value.text.slice(current.text.length);current.text=value.text;insertSpeech(delta,current.context,current.epoch);}
   setState(value);
   if(value.status==='idle'||value.status==='error'){capture.current=null;if(recordingOwner===owner.current)recordingOwner=null;}
  });
 // Draft callbacks change while typing; keep one listener and use the latest callback.
 },[insertSpeech]);
 useEffect(()=>{cancel();return cancel;},[active,context,cancel]);
 useEffect(()=>{if(!recoveryError||!capture.current)return;const stopping=capture.current;void window.musebench?.dictation('stop').catch(()=>{if(capture.current===stopping)setHint('Stop dictation, then copy the extra speech before closing.');});},[recoveryError]);
 const toggle=async()=>{
  const bridge=window.musebench;if(!bridge||!active)return;
  if(capture.current){const stopping=capture.current;await bridge.dictation('stop').catch(()=>{if(capture.current===stopping)cancel();});return;}
  if(recovery.error())return;
  if(recordingOwner&&recordingOwner!==owner.current){setHint('Stop dictation in the other message or comment first.');return;}
  // Finished insertion receipts no longer need to stay in the in-memory index.
  recovery.prune(context);
  const token=++epoch.current;recordingOwner=owner.current;capture.current={id:null,text:'',epoch:token,context,pending:new Map()};setHint('');setState(s=>({...s,status:'starting',error:null}));
  // Context cleanup already cancelled this start's generation. A late response can
  // describe a replacement recording, so it must never send a global cancel.
  try{
   const next=await bridge.dictation('start');if(token!==epoch.current||!latest.current.active||context!==latest.current.context)return;
   const pending=next.id?capture.current?.pending.get(next.id):undefined,value=next.status==='starting'&&pending?pending:next;
   capture.current=['starting','listening'].includes(value.status)?{id:value.id,text:value.text,epoch:token,context,pending:new Map()}:null;
   if(!capture.current&&recordingOwner===owner.current)recordingOwner=null;
   if(value.text)insertSpeech(value.text,context,token);setState(value);
  }
  catch(error){if(token===epoch.current){capture.current=null;if(recordingOwner===owner.current)recordingOwner=null;setState(s=>({...s,status:'error',error:error instanceof Error?error.message:'Dictation could not start.'}));}}
 };
 const reinsert=()=>{if(!latest.current.active||capture.current)return;const text=recovery.text(context);if(!text)return;recovery.remove(context);insertSpeech(text,context,epoch.current);};
 const dismissOverflow=()=>{recovery.remove(context);recovery.flush();};
 return {state,hint,toggle,cancel,overflow,reinsert,dismissOverflow,recoveryError,retryRecovery:recovery.retry,recording:['starting','listening','stopping'].includes(state.status)};
}
