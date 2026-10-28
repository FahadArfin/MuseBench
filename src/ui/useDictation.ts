import {useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import type {DictationState} from '../shared/types';
const empty:DictationState={id:null,status:'idle',available:null,language:null,text:'',error:null};
export function useDictation(active:boolean,context:string,append:Dispatch<SetStateAction<string>>) {
 const [state,setState]=useState(empty),[hint,setHint]=useState('');
 const capture=useRef<{id:string|null;text:string;epoch:number;context:string}|null>(null),epoch=useRef(0);
 const latest=useRef({append,active,context});latest.current={append,active,context};
 const cancel=useCallback(()=>{epoch.current++;capture.current=null;setState(s=>({...s,status:'idle',text:'',error:null}));setHint('');void window.musebench?.dictation('cancel').catch(()=>{});},[]);
 useEffect(()=>{
  const bridge=window.musebench;if(!bridge)return;
  void bridge.dictation('status').then(value=>setState(current=>({...current,available:value.available,language:value.language}))).catch(()=>{});
  return bridge.onDictation(value=>{
   // Availability belongs to the device, including refreshes while Settings is open.
   setState(current=>current.available===value.available&&current.language===value.language?current:{...current,available:value.available,language:value.language});
   const current=capture.current;
   if(!current||!latest.current.active||current.context!==latest.current.context||value.id!==current.id)return;
   if(value.text.startsWith(current.text)&&value.text.length>current.text.length){const delta=value.text.slice(current.text.length).trim();current.text=value.text;latest.current.append(text=>`${text}${text&&!/\s$/.test(text)?' ':''}${delta}`);}
   setState(value);
   if(value.status==='idle'||value.status==='error'){if(!value.text&&!value.error)setHint('No speech caught. Try again or keep typing.');capture.current=null;}
  });
 // Draft callbacks change while typing; keep one listener and use the latest callback.
 },[]);
 useEffect(()=>{cancel();return cancel;},[active,context,cancel]);
 const toggle=async()=>{
  const bridge=window.musebench;if(!bridge||!active)return;
  if(capture.current){await bridge.dictation('stop').catch(()=>cancel());return;}
  const token=++epoch.current;capture.current={id:null,text:'',epoch:token,context};setHint('');setState(s=>({...s,status:'starting',error:null}));
  try{const next=await bridge.dictation('start');if(token!==epoch.current||!latest.current.active||context!==latest.current.context){void bridge.dictation('cancel').catch(()=>{});return;}capture.current=['starting','listening'].includes(next.status)?{id:next.id,text:next.text,epoch:token,context}:null;if(next.text)latest.current.append(text=>`${text}${text&&!/\s$/.test(text)?' ':''}${next.text}`);setState(next);}
  catch(error){if(token===epoch.current){capture.current=null;setState(s=>({...s,status:'error',error:error instanceof Error?error.message:'Dictation could not start.'}));}}
 };
 return {state,hint,toggle,cancel,recording:['starting','listening','stopping'].includes(state.status)};
}
