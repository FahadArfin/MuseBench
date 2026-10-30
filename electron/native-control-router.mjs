import {validateNativeCall} from '../src/shared/native-control.mjs';
const textResult=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const clean=(value,max=240)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max):'';

/** Stable authenticated host delegate; a renderer may attach/detach without changing grants. */
export function createNativeControlRouter({app,controller,getView,getBackground,isBlocked=()=>false}){
 return{async call(name,args,options={}){
  validateNativeCall(name,args);
  if(options.signal?.aborted)throw Error('Request cancelled.');
  if(isBlocked())throw Error('MuseBench is starting, closing or updating. Try again when it is ready.');
  const view=getView();
  if(view){
   const result=await view.call(name,args,options);
   if(name==='app_status')return textResult({...JSON.parse(result.content[0].text),engine:getBackground()});
   return result;
  }
  if(name==='app_status'){
   const state=controller.getState();
   return textResult({version:app.getVersion(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,busy:!!state.busy,selectedTaskId:state.task?.id??null,runtime:{status:state.runtime.status,hostVersion:state.runtime.hostVersion??null,liveVerified:state.runtime.liveVerified===true,needsAttention:!!state.runtime.pending},personal:{available:false,visible:false,loading:false,authenticating:false},engine:getBackground(),chats:(state.tasks??[]).slice(0,100).map(t=>({id:t.id,title:clean(t.title),projectId:t.projectId,status:t.runtimeStatus??'idle',archived:!!t.archived})),chatsTruncated:(state.tasks?.length??0)>100});
  }
  if(name==='read_chat'){
   const page=await controller.readChatHistory({...args,limit:args.limit??20});
   return textResult({taskId:args.taskId,before:page.before,total:page.total,messages:page.messages.map(m=>({id:m.id,role:m.role,text:clean(m.text,3000),truncated:(m.textLength??m.text?.length??0)>3000,at:m.at}))});
  }
  if(name==='diagnostics')return textResult({responsive:null,visible:false,minimized:false,events:[],engine:getBackground(),controllerHasError:!!controller.getState().error});
  throw Error('Open MuseBench from its tray icon or app shortcut before using UI tools.');
 }};
}
