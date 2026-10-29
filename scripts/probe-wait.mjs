// A bounded wait for an observed native receipt; never submits another request.
export async function waitForProbeCondition(predicate,{timeoutMs=10000,cancelled=()=>false}={}){
 const deadline=performance.now()+timeoutMs;
 for(;;){
  if(cancelled())throw Error('Probe cancelled.');
  if(predicate())return;
  const remaining=deadline-performance.now();
  if(remaining<=0)throw Error('Probe deadline.');
  await new Promise(resolve=>setTimeout(resolve,Math.min(25,remaining)));
 }
}
