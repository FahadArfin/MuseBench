const active=new Set(['running','starting','submitting','connecting','checking-permissions','recording','transcribing','listening','stopping']);
export function updateBlocked(...states){return states.some(s=>Boolean(s&&(s.busy||active.has(s.status)||s.tasks?.some(t=>t.runtimeBusy||active.has(t.runtimeStatus))||s.runtime&&(active.has(s.runtime.status)||s.runtime.pending||s.runtime.childrenBusy||s.runtime.operationBusy||['pending','unconfirmed'].includes(s.runtime.cleanup))||s.task&&(s.task.check?.status==='running'||s.task.validationRun?.status==='running'||s.task.goal?.driver?.armed))));}

const label=(value,max=180)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,max):'';
function releaseDetails(info){
 const raw=Array.isArray(info.releaseNotes)?info.releaseNotes.find(item=>item?.version===info.version)?.note:info.releaseNotes;
 // Text only: never pass provider HTML to a renderer HTML sink. Bound before transforms.
 const notes=typeof raw==='string'?raw.slice(0,16000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?(?:p|div|h[1-6]|li|br)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,value=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[value]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,8000):'';
 const date=typeof info.releaseDate==='string'&&info.releaseDate.length<=50?Date.parse(info.releaseDate):NaN;
 return{releaseNotes:notes,releaseDate:Number.isFinite(date)?new Date(date).toISOString():null};
}

export function updateSurfaceBlockers(id,name,state){
 if(!updateBlocked(state))return [];
 return[{id,label:`${name}${state?.item?.title||state?.site?.title?' · '+label(state.item?.title??state.site?.title):''}`,detail:state?.runtime?.cleanup==='unconfirmed'?'Process cleanup is not confirmed.':state?.runtime?.pending?'Waiting for your response.':'Work is still active. Finish or stop it before restarting.'}];
}

export function createUpdateShutdown({isBusy,voice,lock,closeServices,verifyClosed}){
 let preparing=false;
 return{preparing:()=>preparing,async prepare(){
  if(preparing||isBusy())throw Error('Active work');preparing=true;lock(true);let committed=false;
  try{if(updateBlocked(await voice())||isBusy())throw Error('Active work');committed=true;await closeServices();if(!verifyClosed())throw Error('Cleanup unconfirmed');}
  catch(error){if(committed)throw Object.assign(Error('Shutdown needs attention'),{restartRequired:true});lock(false);throw error;}
  finally{preparing=false;}
 }};
}

/** Main-process-owned updater. Renderer commands never contain paths, URLs or tokens. */
export function createAppUpdates({updater,version,enabled,isBusy,getBlockers,prepareInstall,onState=()=>{},setInterval:interval=globalThis.setInterval,clearInterval:clear=globalThis.clearInterval}){
 let state={version,status:enabled?'idle':'unsupported',availableVersion:null,downloadedVersion:null,releaseNotes:'',releaseDate:null,percent:0,lastChecked:null,error:null},operation=false,timer,closed=false;
 const blockers=()=>{
  try{
   const rows=getBlockers?.()??[];if(!Array.isArray(rows))throw Error('Invalid observations');
   const result=rows.slice(0,24).map((item,index)=>({id:label(item?.id,160)||`work-${index}`,label:label(item?.label)||'Active work',detail:label(item?.detail,240)||'Finish or stop this work before restarting.'}));
   if(rows.length>24)result.push({id:'more',label:'More active work',detail:`${rows.length-24} additional items are preventing restart.`});
   if(!getBlockers&&!result.length&&isBusy())result.push({id:'active',label:'Active work',detail:'Finish or stop active work before restarting.'});
   return result;
  }catch{return[{id:'unknown',label:'Restart readiness',detail:'Could not be confirmed. Refresh status before restarting.'}];}
 };
 const snapshot=()=>structuredClone({...state,blockers:state.status==='downloaded'?blockers():[]}),patch=value=>{if(!closed){state={...state,...value};onState(snapshot());}};
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.logger=null;
 const handlers={
  'update-available':info=>{if(state.status==='checking'&&/^\d+\.\d+\.\d+$/.test(info?.version??''))patch({status:'available',availableVersion:info.version,downloadedVersion:null,...releaseDetails(info),error:null,lastChecked:new Date().toISOString()});},
  'update-not-available':()=>{if(state.status==='checking')patch({status:'current',availableVersion:null,downloadedVersion:null,releaseNotes:'',releaseDate:null,error:null,lastChecked:new Date().toISOString()});},
  'download-progress':info=>{if(state.status==='downloading'&&Number.isFinite(info.percent))patch({percent:Math.max(0,Math.min(100,Math.round(info.percent)))});},
  'update-downloaded':info=>{if(state.status==='downloading'&&info?.version===state.availableVersion)patch({status:'downloaded',downloadedVersion:info.version,percent:100,error:null});},
  error:()=>{if(state.status==='checking')patch({status:'error',error:'Could not check for updates. Check your connection and try again.'});else if(state.status==='installing')patch({status:'restart-required',error:'Could not start the installer. Close and reopen MuseBench before retrying.'});},
 };
 for(const [event,fn] of Object.entries(handlers))updater.on(event,fn);
 async function dispatch(command){
  if(!['status','check','download','install'].includes(command))throw Error('Unsupported update action.');
  if(command==='status')return snapshot();
  if(closed||!enabled)throw Error('Automatic installation is unavailable for this package. Download the latest release from GitHub.');
  if(operation)return snapshot();
  if(['installing','restart-required'].includes(state.status))return snapshot();
  if(command==='check'&&state.status==='downloaded')return snapshot();
  if(command==='download'&&state.status!=='available')throw Error('Check for an available update first.');
  if(command==='install'&&(state.status!=='downloaded'||state.downloadedVersion!==state.availableVersion||blockers().length||isBusy())){patch({error:'Finish or stop active work before restarting to update.'});throw Error('Finish or stop active work before restarting to update.');}
  operation=true;let installPrepared=false;
  try{
   if(command==='check'){patch({status:'checking',error:null});await updater.checkForUpdates();if(state.status==='checking')throw Error('Update check did not confirm a result.');}
   if(command==='download'){patch({status:'downloading',percent:0,error:null});await updater.downloadUpdate();if(state.status!=='downloaded')throw Error('Download was not confirmed.');}
   if(command==='install'){patch({status:'installing',error:null});await prepareInstall();installPrepared=true;updater.quitAndInstall(true,true);}
  }catch(error){
   const restartRequired=error.restartRequired||installPrepared;
   patch({status:restartRequired?'restart-required':command==='install'?'downloaded':command==='download'?'available':'error',error:restartRequired?(installPrepared?'Could not start the installer. Close and reopen MuseBench before retrying.':'Shutdown could not be confirmed. Close and reopen MuseBench before retrying.'):command==='install'?'Could not restart to update. Finish active work and try again.':command==='download'?'Download failed. Check your connection and try again.':'Could not check for updates. Check your connection and try again.'});
  }finally{operation=false;}
  return snapshot();
 }
 return{snapshot,dispatch,start(){if(enabled&&!timer){timer=interval(()=>{void dispatch('check').catch(()=>{});},30*60*1000);timer.unref?.();}},close(){closed=true;if(timer)clear(timer);for(const [event,fn] of Object.entries(handlers))updater.removeListener(event,fn);}};
}
