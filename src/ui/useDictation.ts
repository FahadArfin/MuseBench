import {useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import type {DictationState} from '../shared/types';
const empty:DictationState={id:null,status:'idle',available:null,language:null,text:'',error:null};
export function useDictation(active:boolean,context:string,append:Dispatch<SetStateAction<string>>) {
 const [state,setState]=useState(empty),[hint,setHint]=useState('');
 const capture=useRef<{id:string|null;text:string;epoch:number}|null>(null),epoch=useRef(0);
 const cancel=useCallback(()=>{epoch.current++;capture.current=null;setState(s=>({...s,status:'idle',text:'',error:null}));setHint('');void window.musebench?.dictation('cancel').catch(()=>{});},[]);
 useEffect(()=>{
  const bridge=window.musebench;if(!bridge)return;
  void bridge.dictation('status').then(value=>setState(current=>({...current,available:value.available,language:value.language}))).catch(()=>{});
  return bridge.onDictation(value=>{
   const current=capture.current;
   if(!current||value.id!==current.id)return;
   if(value.text.startsWith(current.text)&&value.text.length>current.text.length){const delta=value.text.slice(current.text.length).trim();current.text=value.text;append(text=>`${text}${text&&!/\s$/.test(text)?' ':''}${delta}`);}
   setState(value);
   if(value.status==='idle'||value.status==='error'){if(!value.text&&!value.error)setHint('No speech caught. Try again or keep typing.');capture.current=null;}
  });
 },[append]);
 useEffect(()=>{cancel();return cancel;},[active,context,cancel]);
 const toggle=async()=>{
  const bridge=window.musebench;if(!bridge||!active)return;
  if(capture.current){await bridge.dictation('stop').catch(()=>cancel());return;}
  const token=++epoch.current;capture.current={id:null,text:'',epoch:token};setHint('');setState(s=>({...s,status:'starting',error:null}));
  try{const next=await bridge.dictation('start');if(token!==epoch.current){void bridge.dictation('cancel').catch(()=>{});return;}capture.current=['starting','listening'].includes(next.status)?{id:next.id,text:next.text,epoch:token}:null;if(next.text)append(text=>`${text}${text&&!/\s$/.test(text)?' ':''}${next.text}`);setState(next);}
  catch(error){if(token===epoch.current){capture.current=null;setState(s=>({...s,status:'error',error:error instanceof Error?error.message:'Dictation could not start.'}));}}
 };
 return {state,hint,toggle,cancel,recording:['starting','listening','stopping'].includes(state.status)};
}
