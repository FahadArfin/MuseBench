// Presentation ownership only. Controller persistence, notifications and other
// observers never wait on this stream. Invoked reads use the same revision clock
// but do not occupy the bounded push slot or wait for its acknowledgement.
export function createRendererStatePublisher({send,readState,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
 let generation=0,revision=0,attached=false,closed=false,suspended=false,inFlight=null,pending=null,timer=null;
 let sent=0,timeouts=0,maxInFlight=0,maxPending=0;
 const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const envelope=state=>({version:1,generation,revision:++revision,state});
 const read=()=>envelope(readState());
 const deliver=value=>{
  inFlight={generation:value.generation,revision:value.revision,sentAt:now()};sent++;maxInFlight=Math.max(maxInFlight,1);
  timer=setTimer(()=>{timer=null;if(inFlight){suspended=true;timeouts++;}},2000);timer?.unref?.();
  try{send(value);}catch{cancelTimer();suspended=true;}
 };
 const rotate=()=>{cancelTimer();generation++;inFlight=null;pending=null;suspended=false;};
 return Object.freeze({
  read,
  publish(state){if(closed)return;const value=envelope(state);if(!attached||inFlight||suspended){pending=value;maxPending=Math.max(maxPending,1);}else deliver(value);},
  ack(value){
   if(closed||!attached||!inFlight||!Number.isSafeInteger(value?.generation)||!Number.isSafeInteger(value?.revision)||value.generation!==inFlight.generation||value.revision!==inFlight.revision)return false;
   if(!suspended&&now()-inFlight.sentAt>=2000){suspended=true;timeouts++;}
   cancelTimer();inFlight=null;
   if(suspended){suspended=false;pending=null;deliver(read());}
   else if(pending){const next=pending;pending=null;deliver(next);}
   return true;
  },
  attach(){if(closed)return;rotate();attached=true;deliver(read());},
  detach(){if(closed)return;rotate();attached=false;},
  close(){if(closed)return;rotate();attached=false;closed=true;},
  get diagnostics(){return Object.freeze({generation,revision,attached,closed,suspended,inFlight:inFlight?1:0,pending:pending?1:0,maxInFlight,maxPending,sent,timeouts,inFlightAgeMs:inFlight?Math.max(0,now()-inFlight.sentAt):null});},
 });
}
