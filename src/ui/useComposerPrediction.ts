import {useEffect,useRef,useState} from 'react';
import type {Task} from '../shared/types';
import {latestPredictionReply,localPrediction} from '../shared/composer-predictions.mjs';

export function useComposerPrediction(task:Task|undefined,enabled:boolean,useMuse:boolean,active:boolean){
 const reply=latestPredictionReply(task),key=task&&reply?`${task.id}:${reply.id}:${reply.text}`:'';
 const [result,setResult]=useState({key:'',text:''}),[dismissed,setDismissed]=useState('');
 const sequence=useRef(0);
 useEffect(()=>{const api=window.musebench;if(!api?.composerPrediction)return;void api.composerPrediction({type:'configure',enabled:enabled&&useMuse}).catch(()=>{});},[enabled,useMuse]);
 useEffect(()=>{
  if(!enabled||!active||!task||!reply||!key)return;
  let live=true;const fallback=localPrediction(task),requestId='prediction-'+Date.now()+'-'+(++sequence.current);
  if(!useMuse||!window.musebench?.composerPrediction){setResult({key,text:fallback});return;}
  setResult({key,text:''});
  const timer=window.setTimeout(()=>{void window.musebench!.composerPrediction!({type:'request',taskId:task.id,replyId:reply.id,requestId}).then(value=>{if(live)setResult({key,text:value.text||fallback});}).catch(()=>{if(live)setResult({key,text:fallback});});},650);
  return()=>{live=false;clearTimeout(timer);void window.musebench?.composerPrediction?.({type:'cancel',requestId}).catch(()=>{});};
 },[enabled,useMuse,active,key]);
 return{text:enabled&&active&&key&&result.key===key&&dismissed!==key?result.text:'',dismiss:()=>setDismissed(key)};
}
