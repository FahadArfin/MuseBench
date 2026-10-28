const active=new Set(['running','starting','submitting','connecting','checking-permissions','recording','transcribing','listening','stopping']);
export function updateBlocked(...states){return states.some(s=>Boolean(s&&(s.busy||active.has(s.status)||s.tasks?.some(t=>t.runtimeBusy||active.has(t.runtimeStatus))||s.runtime&&(active.has(s.runtime.status)||s.runtime.pending||s.runtime.childrenBusy||s.runtime.operationBusy||['pending','unconfirmed'].includes(s.runtime.cleanup))||s.task&&(s.task.check?.status==='running'||s.task.validationRun?.status==='running'||s.task.goal?.driver?.armed))));}

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
export function createAppUpdates({updater,version,enabled,isBusy,prepareInstall,onState=()=>{},setInterval:interval=globalThis.setInterval,clearInterval:clear=globalThis.clearInterval}){
 let state={version,status:enabled?'idle':'unsupported',availableVersion:null,percent:0,lastChecked:null,error:null},operation=false,timer,closed=false;
 const snapshot=()=>structuredClone(state),patch=value=>{if(!closed){state={...state,...value};onState(snapshot());}};
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.logger=null;
 const handlers={
  'update-available':info=>{if(state.status==='checking'&&/^\d+\.\d+\.\d+$/.test(info?.version??''))patch({status:'available',availableVersion:info.version,error:null,lastChecked:new Date().toISOString()});},
  'update-not-available':()=>{if(state.status==='checking')patch({status:'current',availableVersion:null,error:null,lastChecked:new Date().toISOString()});},
  'download-progress':info=>{if(state.status==='downloading'&&Number.isFinite(info.percent))patch({percent:Math.max(0,Math.min(100,Math.round(info.percent)))});},
  'update-downloaded':info=>{if(state.status==='downloading'&&info?.version===state.availableVersion)patch({status:'downloaded',percent:100,error:null});},
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
  if(command==='install'&&(state.status!=='downloaded'||isBusy()))throw Error('Finish or stop active work before restarting to update.');
  operation=true;
  try{
   if(command==='check'){patch({status:'checking',error:null});await updater.checkForUpdates();if(state.status==='checking')throw Error('Update check did not confirm a result.');}
   if(command==='download'){patch({status:'downloading',percent:0,error:null});await updater.downloadUpdate();if(state.status!=='downloaded')throw Error('Download was not confirmed.');}
   if(command==='install'){patch({status:'installing',error:null});await prepareInstall();updater.quitAndInstall(true,true);}
  }catch(error){
   patch({status:error.restartRequired?'restart-required':command==='install'?'downloaded':command==='download'?'available':'error',error:error.restartRequired?'Shutdown could not be confirmed. Close and reopen MuseBench before retrying.':command==='install'?'Could not restart to update. Finish active work and try again.':command==='download'?'Download failed. Check your connection and try again.':'Could not check for updates. Check your connection and try again.'});
  }finally{operation=false;}
  return snapshot();
 }
 return{snapshot,dispatch,start(){if(enabled&&!timer){timer=interval(()=>{void dispatch('check').catch(()=>{});},30*60*1000);timer.unref?.();}},close(){closed=true;if(timer)clear(timer);for(const [event,fn] of Object.entries(handlers))updater.removeListener(event,fn);}};
}
