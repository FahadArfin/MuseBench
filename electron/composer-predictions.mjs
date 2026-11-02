import {createHash} from 'node:crypto';
import {latestPredictionReply,predictionReady,predictionContext,predictionInstructions,parsePrediction} from '../src/shared/composer-predictions.mjs';

/** Optional inference owner. No model call until the trusted UI explicitly opts in. */
export function createComposerPredictions({getState,runtimeFactory,timeoutMs=25000}={}){
 let enabled=false,closed=false,current=null;const cache=new Map(),attempts=new Set(),cleanup=new Set(),unresolved=new Set();
 const owner=(taskId,replyId)=>{const s=getState(),reply=latestPredictionReply(s.task);if(closed||s.busy||s.task?.id!==taskId||s.task.mode!=='muse'||s.task.projectId!==s.activeProject?.id||reply?.id!==replyId||!predictionReady(s.task,s.runtime))throw Error('The prediction chat changed or is busy.');return s;};
 const fingerprint=s=>createHash('sha256').update(s.task.id+'\0'+latestPredictionReply(s.task)?.id+'\0'+s.activeProject.root+'\0'+predictionContext(s.task)+'\0'+(s.task.runOptions?.model??'')).digest('hex');
 const valid=r=>{try{return enabled&&current===r&&fingerprint(owner(r.taskId,r.replyId))===r.key;}catch{return false;}};
 async function finish(r,text=''){
  if(r.done)return;r.done=true;clearTimeout(r.timer);r.unsubscribe?.();if(current===r)current=null;
  if(!r.runtime){r.resolve({text,requestId:r.requestId});return;}
  unresolved.add(r.runtime);const job=Promise.resolve().then(()=>r.runtime.disconnect()).then(()=>{if(r.runtime.snapshot().cleanup!=='unconfirmed')unresolved.delete(r.runtime);}).catch(()=>{});cleanup.add(job);try{await job;}finally{cleanup.delete(job);r.resolve({text,requestId:r.requestId});}
 }
 const stop=()=>current?finish(current):Promise.resolve();
 return{
  isBusy:()=>!!current||cleanup.size>0||unresolved.size>0,
  reconcile(){if(current&&!valid(current))void finish(current);},
  async close(){closed=true;enabled=false;await stop();await Promise.allSettled([...cleanup]);for(const runtime of [...unresolved]){await runtime.disconnect().catch(()=>{});if(runtime.snapshot().cleanup!=='unconfirmed')unresolved.delete(runtime);}cache.clear();attempts.clear();if(unresolved.size)throw Error('Prediction cleanup could not be confirmed.');},
  async command(input){
   const keys={configure:['enabled'],request:['taskId','replyId','requestId'],cancel:['requestId']};
   if(!input||!Object.hasOwn(keys,input.type)||Object.keys(input).some(k=>!['type',...keys[input.type]].includes(k))||keys[input.type].some(k=>!Object.hasOwn(input,k)))throw Error('Invalid composer prediction command.');
   if(closed)throw Error('Predictions are closed.');
   if(input.type==='configure'){if(typeof input.enabled!=='boolean')throw Error('Invalid prediction setting.');enabled=input.enabled;if(!enabled)await stop();return{text:''};}
   if(input.type==='cancel'){if(typeof input.requestId!=='string')throw Error('Invalid prediction identity.');if(current?.requestId===input.requestId)await stop();return{text:''};}
   if(!enabled)throw Error('Enable Predict with Muse before requesting model predictions.');
   if(['taskId','replyId','requestId'].some(key=>typeof input[key]!=='string'||!input[key]||input[key].length>200))throw Error('Invalid prediction identity.');
   const state=owner(input.taskId,input.replyId),key=fingerprint(state),attemptKey=JSON.stringify([input.taskId,input.replyId,state.activeProject.root]);if(cache.has(key))return{text:cache.get(key),requestId:input.requestId};
   if(attempts.has(attemptKey)||current||cleanup.size||unresolved.size)return{text:'',requestId:input.requestId};
   attempts.add(attemptKey);
   const r={...input,key,root:state.activeProject.root,done:false,runtime:null};current=r;
   const result=new Promise(resolve=>r.resolve=resolve);r.timer=setTimeout(()=>void finish(r),timeoutMs);r.timer.unref?.();
   void(async()=>{try{
    r.runtime=runtimeFactory();r.unsubscribe=r.runtime.subscribe(value=>{
     if(!valid(r)){void finish(r);return;}
     if(value.status==='completed'){const rows=(value.messages??[]).filter(m=>m.kind==='agentMessage'&&typeof m.text==='string');const text=parsePrediction(rows.at(-1)?.text??'');cache.set(key,text);while(cache.size>50)cache.delete(cache.keys().next().value);void finish(r,text);}
     else if(['failed','blocked','uncertain','unavailable','cancelled','closed'].includes(value.status))void finish(r);
    });
    await r.runtime.connect({workspaceRoot:r.root,...(state.runtime?.binary?{binary:state.runtime.binary}:{}),fullAccess:false});
    if(!valid(r)||r.done)return;
    await r.runtime.send({text:predictionInstructions+'\n\nCONVERSATION DATA:\n'+predictionContext(state.task),mode:'prediction',runOptions:{reasoning:'minimal',approval:'ask',...(state.task.runOptions?.model?{model:state.task.runOptions.model}:{})}});
   }catch{void finish(r);}})();
   return result;
  },
 };
}
