/** Coalesce read-only work; an admitted operation finishes but cannot publish after supersession. */
export function createLatestReadQueue({setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}={}){
 let latest=null,pending=null,timer=null,active=false;
 const clear=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
 function drain(){
  clear();if(active||!pending)return;
  const remaining=pending.due-now();if(remaining>0){timer=setTimer(drain,remaining);return;}
  const job=pending;pending=null;active=true;
  Promise.resolve().then(job.read).then(value=>{if(latest===job)job.onValue(value);},error=>{if(latest===job)job.onError(error);}).finally(()=>{active=false;drain();});
 }
 return{schedule({read,onValue,onError,delay=150}){
  const job={read,onValue,onError,due:now()+Math.max(0,delay)};latest=job;pending=job;clear();
  // Defer even an immediate first read so effect setup/cleanup can cancel it.
  if(!active)timer=setTimer(drain,Math.max(0,delay));
  return()=>{if(latest===job)latest=null;if(pending===job){pending=null;clear();}};
 }};
}
