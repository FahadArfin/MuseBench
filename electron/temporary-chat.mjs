import {composeChatContext} from '../src/shared/chat-context.mjs';
import {restoreRunOptions} from '../src/shared/run-options.mjs';
export function createTemporaryChat({getState,runtimeFactory,onState=()=>{}}){
 let record=null,epoch=0,revision=0;const unresolved=new Set();
 const snapshot=()=>record?{revision,taskId:record.taskId,status:record.status,busy:record.busy,error:record.error,messages:structuredClone(record.messages)}:{revision,taskId:null,status:'closed',busy:false,error:null,messages:[]};
 const emit=()=>{revision++;onState(snapshot());};
 const bind=id=>{const s=getState();if(!id||s.task?.id!==id||s.task.archived||s.activeProject?.id!==s.task.projectId)throw Error('Open the original active chat.');return s;};
 const current=(r,token)=>record===r&&epoch===token&&getState().task?.id===r.taskId&&getState().activeProject?.root===r.root;
 async function stop(discard=true){
  const old=record,rt=old?.runtime;++epoch;
  old?.unsubscribe?.();if(rt)unresolved.add(rt);
  if(discard)record=null;else if(old){old.runtime=null;old.unsubscribe=null;old.busy=false;old.status='cancelled';old.error=null;}
  emit();
  for(const pending of [...unresolved]){try{await pending.disconnect();if(pending.snapshot().cleanup!=='unconfirmed')unresolved.delete(pending);}catch{}}
  if(unresolved.size){if(record){record.error='Side chat cleanup could not be confirmed. Retry Stop.';emit();}throw Error('Side chat cleanup could not be confirmed. Retry closing it.');}
 }

 return{snapshot,isBusy:()=>!!record?.busy||record?.runtime?.snapshot().cleanup==='unconfirmed'||unresolved.size>0,
  async reconcile(){if(record&&(getState().task?.id!==record.taskId||getState().activeProject?.root!==record.root))await stop();},close:stop,
  async command(input){
   if(!input||!['open','status','send','stop','close'].includes(input.type)||Object.keys(input).some(k=>!['type','taskId','text'].includes(k)))throw Error('Invalid temporary chat command.');
   if(input.type==='close'||input.type==='stop'){if(record&&record.taskId!==input.taskId)throw Error('The side chat changed.');await stop(input.type==='close');return snapshot();}
   const s=bind(input.taskId);if(record&&(record.taskId!==input.taskId||record.root!==s.activeProject.root))await stop();
   if(!record){if(unresolved.size)throw Error('Finish side chat cleanup first.');record={taskId:input.taskId,root:s.activeProject.root,status:'idle',busy:false,error:null,messages:[],serial:0};}
   if(input.type==='send'){
    if(typeof input.text!=='string'||!input.text.trim()||input.text.length>16000)throw Error('Use a question up to 16,000 characters.');if(unresolved.size||record.runtime?.snapshot().cleanup==='unconfirmed')throw Error('Finish side chat cleanup first.');if(record.busy)throw Error('Wait for the side chat response.');
    const r=record,token=epoch,options={...restoreRunOptions(s.task.runOptions),approval:'ask',budget:'standard'},serial=++r.serial;
    const prepared=composeChatContext({task:{request:'',messages:r.messages},project:s.activeProject,memories:s.memories,text:input.text,history:true});
    r.baseline=new Set((r.runtime?.snapshot().messages??[]).map(m=>m.id));
    r.messages.push({id:'user-'+serial,role:'user',text:input.text.trim()});r.messages=r.messages.slice(-40);r.busy=true;r.error=null;r.status='starting';
    if(!r.runtime){r.runtime=runtimeFactory();r.unsubscribe=r.runtime.subscribe(value=>{
     if(!current(r,token))return;r.status=value.status;
     for(const message of value.messages??[])if(message.kind==='agentMessage'&&typeof message.id==='string'&&!r.baseline.has(message.id)&&typeof message.text==='string'){
      const id='answer-'+r.serial+'-'+message.id,old=r.messages.find(m=>m.id===id);if(old)old.text=message.text.slice(0,64000);else r.messages.push({id,role:'assistant',text:message.text.slice(0,64000)});
     }
     r.messages=r.messages.slice(-40);
     if(['completed','failed','cancelled','blocked','uncertain','unavailable','closed'].includes(value.status)){r.busy=false;r.error=value.status==='completed'?null:value.reason??'The side request did not complete.';}emit();
    });}
    void(async()=>{try{
     if(!r.runtime.snapshot().permissionVerified)await r.runtime.connect({workspaceRoot:r.root,...(s.runtime?.binary?{binary:s.runtime.binary}:{}),fullAccess:false});
     if(!current(r,token))return;r.busy=true;await r.runtime.send({text:prepared.prompt,mode:'plan',runOptions:options});
    }catch(error){if(current(r,token)){r.busy=false;r.status='failed';r.error=error.message;emit();}}})();
   }
   emit();return snapshot();
  },
 };
}
