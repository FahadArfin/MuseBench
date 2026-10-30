import {useEffect,useRef,useState} from 'react';
import {createLatestReadQueue} from '../shared/latest-read.mjs';

/** key covers every read input; owner separates data that must never remain visible together. */
export function useLatestRead<T>({owner,key,revision=0,read}:{owner:string;key:string;revision?:number;read:()=>Promise<T>}){
 const [queue]=useState(()=>createLatestReadQueue());
 const previous=useRef<{owner:string;revision:number}|null>(null);
 const [observation,setObservation]=useState<{owner:string;key:string;revision:number;value?:T;error:string;pending:boolean}>();
 useEffect(()=>{
  const delay=previous.current?.owner===owner&&previous.current.revision===revision?150:0;
  previous.current={owner,revision};const identity={owner,key,revision};
  setObservation(before=>({...identity,value:before?.owner===owner?before.value:undefined,error:'',pending:true}));
  return queue.schedule({delay,read,onValue:value=>setObservation({...identity,value,error:'',pending:false}),onError:error=>setObservation(before=>({...identity,value:before?.owner===owner?before.value:undefined,error:String(error),pending:false}))});
  // The exact committed request closure belongs to this identity, not a later render.
 },[queue,owner,key,revision]);
 const sameOwner=observation?.owner===owner,current=sameOwner&&observation.key===key&&observation.revision===revision;
 return{value:sameOwner?observation.value:undefined,error:current?observation.error:'',pending:!current||observation.pending};
}
