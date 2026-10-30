const id=v=>typeof v==='string'&&v.length>0&&v.length<=200;
const itemsOf=r=>r?.history?.mode==='inline'?r.history.items:r?.history?.snapshot?.state?.items;
const transcript=items=>items.filter(i=>['userMessage','agentMessage'].includes(i.kind)).map(i=>({kind:i.kind,turnId:i.turnId,text:i.text??'',status:i.status}));
const idle=r=>r?.session?.status==='idle'&&r.session.activeTurnId===null&&Array.isArray(r.pendingRequests)&&r.pendingRequests.length===0&&!(r.queuedInputs?.length)&&!(r.history?.snapshot?.state?.queuedTurns?.length)&&!(itemsOf(r)??[]).some(i=>['workflow','subagent'].includes(i.kind)&&!['completed','failed','cancelled','closed'].includes(i.status));
/** No retries. A leave ACK is admission only; independent restoration needs settlement. */
export async function forkNativeSession({connection,subscribeNotifications,sessionId,lastTurnId,workspaceRoot,permissionCheck,timeoutMs=10000,onReceipt=()=>{},isCurrent=()=>true}){
 if(!id(sessionId)||lastTurnId!==undefined&&!id(lastTurnId))throw Error('Invalid native fork source or cut.');
 const bounded=async promise=>{let t;try{return await Promise.race([promise,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('Native fork operation timed out.')),timeoutMs);})]);}finally{clearTimeout(t);}};
 const check=()=>{if(!isCurrent())throw Error('Native fork ownership changed.');};
 const source=await bounded(connection.request('session/read',{sessionId,excludeItems:false}));check();
 const sourceItems=itemsOf(source);if(!Array.isArray(sourceItems)||sourceItems.length>4096||JSON.stringify(sourceItems).length>4*1024*1024)throw Error('Native source history is unavailable or exceeds the bounded fork limit.');
 if(source.session?.sessionId!==sessionId||source.session.workspaceRoot!==workspaceRoot||source.session.providerId!=='meta'||!id(source.session.modelId)||!permissionCheck(source.session)||!idle(source))throw Error('Fork requires a verified idle source without pending work.');
 if(lastTurnId&&!(itemsOf(source)??[]).some(i=>i.kind==='agentMessage'&&i.turnId===lastTurnId&&i.status==='completed'))throw Error('The selected cut has no completed native response.');
 let receipt={sessionId,commandId:connection.mintCommandId(),...(lastTurnId?{lastTurnId}:{}),status:'submitting',at:new Date().toISOString()},submitted=false,finished=false,unsub;
 const publish=async patch=>{receipt={...receipt,...patch};await onReceipt(structuredClone(receipt));};
 try{
  await publish({});check();submitted=true;
  const operation=connection.command('session/fork',{sessionId,...(lastTurnId?{cutPoint:{lastTurnId}}:{}),excludeItems:false},{commandId:receipt.commandId,maxAttempts:1});
  // A response arriving after the timeout still owns a real native identity.
  // Retain it for inspection; never drive or release it after losing certainty.
  Promise.resolve(operation).then(async result=>{if(finished&&id(result?.session?.sessionId))await publish({childSessionId:result.session.sessionId,status:'unknown',reason:'Native fork result arrived after confirmation was lost. Inspect this child session before another fork.'});}).catch(()=>{});
  const result=await bounded(operation);
  const child=result?.session;await publish({...(id(child?.sessionId)?{childSessionId:child.sessionId}:{}),status:'verifying'});check();
  if(!id(child?.sessionId)||child.sessionId===sessionId||child.workspaceRoot!==workspaceRoot||child.providerId!==source.session.providerId||child.modelId!==source.session.modelId||!permissionCheck(child)||JSON.stringify(child.permissionState)!==JSON.stringify(source.session.permissionState)||child.forkedFrom?.sessionId!==sessionId||child.forkedFrom.commandId!==receipt.commandId||child.forkedFrom.cutExplicit!==!!lastTurnId||!id(child.forkedFrom.cutCursor)||!idle(result))throw Error('Native fork identity, provenance, permissions or inactive state could not be verified.');
  const cutIndex=lastTurnId?sourceItems.findLastIndex(i=>i.turnId===lastTurnId):sourceItems.length-1,childItems=itemsOf(result);
  if(!Array.isArray(childItems)||JSON.stringify(transcript(childItems))!==JSON.stringify(transcript(sourceItems.slice(0,cutIndex+1))))throw Error('Native fork history does not match the completed source cut.');
  await publish({status:'releasing',leaveCommandId:connection.mintCommandId()});check();
  let settle;const settlement=new Promise(resolve=>settle=resolve);
  unsub=subscribeNotifications(frame=>{const p=frame.params;if(frame.method==='session/leaveCompleted'&&p?.sessionId===child.sessionId&&p.commandId===receipt.leaveCommandId)settle(p);});
  const ack=await bounded(connection.command('session/leave',{sessionId:child.sessionId},{commandId:receipt.leaveCommandId,maxAttempts:1}));check();
  if(ack?.commandId!==receipt.leaveCommandId||ack.status!=='accepted')throw Error('Native fork release admission was not confirmed.');
  const release=await bounded(settlement);check();
  if(release.outcome!=='released'||typeof release.viewCursor!=='string')throw Error('Native fork release was not confirmed.');
  await publish({status:'released',release:{outcome:'released',viewCursor:release.viewCursor}});
  return structuredClone(receipt);
 }catch(error){if(submitted)await publish({status:!receipt.childSessionId&&([-32023,-32030].includes(error.code)||['invalidParams','sessionNotFound','sessionInUse','forkBoundaryInvalid','commandRejected','experimentalRequired','capabilityRequired'].includes(error.data?.kind))?'rejected':'unknown',reason:String(error.message).slice(0,1000)});error.forkReceipt=structuredClone(receipt);throw error;}
 finally{finished=true;if(typeof unsub==='function')unsub();}
}
