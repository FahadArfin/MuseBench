import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {historyTarget,visit,type NavigationHistory} from '../shared/navigation-history.mjs';
import './navigation-history.css';

export type HistoryControls={canBack:boolean;canForward:boolean;go:(direction:-1|1)=>void};
export const NavigationHistoryContext=createContext<HistoryControls>({canBack:false,canForward:false,go:()=>{}});
export function NavigationButtons(){
 const history=useContext(NavigationHistoryContext);
 return <div className="navigation-history" role="group" aria-label="Navigation history"><button type="button" className="icon-button" aria-label="Go back" title="Back · Alt+Left" disabled={!history.canBack} onClick={()=>history.go(-1)}><ChevronLeft size={17}/></button><button type="button" className="icon-button" aria-label="Go forward" title="Forward · Alt+Right" disabled={!history.canForward} onClick={()=>history.go(1)}><ChevronRight size={17}/></button></div>;
}

export function useNavigationHistory({route,ready,blocked,restore,available,onError}:{route:string|null;ready:boolean;blocked:boolean;restore:(route:string)=>Promise<void>;available:(route:string)=>boolean;onError:(message:string)=>void}):HistoryControls{
 const [history,setHistory]=useState<NavigationHistory>({entries:[],index:-1}),[moving,setMoving]=useState(false);
 const replaying=useRef(false),latest=useRef({history,blocked,restore,available,onError});latest.current={history,blocked,restore,available,onError};
 useEffect(()=>{
  if(!route||!ready||replaying.current)return;
  const frame=requestAnimationFrame(()=>{if(!replaying.current)setHistory(current=>visit(current,route));});
  return()=>cancelAnimationFrame(frame);
 },[route,ready,moving]);
 const go=async(direction:-1|1)=>{
  const current=latest.current;if(replaying.current||current.blocked)return;
  const index=historyTarget(current.history,direction,current.available);if(index<0)return;
  replaying.current=true;setMoving(true);
  try{
   await current.restore(current.history.entries[index]);
   setHistory({...current.history,index});
   // Keep state updates from an asynchronous selection out of the visit log.
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }catch(error){current.onError(error instanceof Error?error.message:String(error));}
  finally{replaying.current=false;setMoving(false);}
 };
 const controls={canBack:!blocked&&!moving&&historyTarget(history,-1,available)>=0,canForward:!blocked&&!moving&&historyTarget(history,1,available)>=0,go:(direction:-1|1)=>{void go(direction);}};
 const controlsRef=useRef(controls);controlsRef.current=controls;
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
   event.preventDefault();controlsRef.current.go(event.key==='ArrowLeft'?-1:1);
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[]);
 return controls;
}
