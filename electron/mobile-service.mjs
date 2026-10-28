import {hostname} from 'node:os';
const clean=(value,max=300)=>typeof value==='string'?value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,max):'';
export function createMobileService({controller,isBlocked=()=>false}){
 const chats=state=>(state.tasks??[]).filter(t=>t.mode==='muse'&&!t.archived).slice(0,500);
 return{
  snapshot(){const state=controller.getState();return{name:hostname(),selectedTaskId:state.task?.id??null,busy:!!state.busy,projects:state.projects.map(p=>({id:p.id,name:clean(p.name)})),chats:chats(state).map(t=>({id:t.id,title:clean(t.title),projectId:t.projectId,updatedAt:t.updatedAt,status:t.runtimeStatus??'idle',busy:!!t.runtimeBusy})),needsAttention:!!state.runtime.pending,notice:state.runtime.pending?'Approval or input is needed on your desktop.':null};},
  readChat({taskId,before}){
   const state=controller.getState(),chat=chats(state).find(t=>t.id===taskId);if(!chat)throw Error('Chat is unavailable.');
   const page=controller.readChatHistory({taskId,...(before?{before}:{}),limit:30});
   return{taskId,title:clean(chat.title),before:page.before,total:page.total,messages:page.messages.filter(m=>['user','assistant','system'].includes(m.role)).map(m=>({id:m.id,role:m.role,text:clean(m.text,8000),truncated:(m.textLength??m.text?.length)>8000,at:m.at})),selected:state.task?.id===taskId,status:chat.runtimeStatus??'idle'};
  },
  async command(input){
   if(isBlocked())throw Error('Finish the current desktop setup or update first.');
   const type={select:'mobileSelect',send:'mobileMessage',stop:'mobileStop'}[input.kind];if(!type)throw Error('Unsupported companion command.');
   const before=new Set((controller.getState().task?.executionReceipts??[]).map(r=>r.id));
   let state;
   try{state=await controller.dispatch({type,taskId:input.taskId,...(input.kind==='send'?{text:input.text}:{})});}
   catch(error){throw Object.assign(error,{outcome:input.kind==='send'?'unknown':'failed'});}
   if(state.error){
    const uncertain=input.kind==='send'&&state.task?.id===input.taskId&&state.task.executionReceipts?.some(r=>!before.has(r.id)&&r.result==='unknown');
    throw Object.assign(Error(state.error),{outcome:uncertain?'unknown':'failed'});
   }
   return{ok:true};
  },
 };
}
