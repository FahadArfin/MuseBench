const { contextBridge, ipcRenderer } = require('electron');
const launchActive = process.argv.includes('--musebench-launch-animation') && Boolean(ipcRenderer.sendSync('musebench:launch-claim'));
// One ordering gate for every Code snapshot. Action results remain independent:
// callers receive their exact result, while only canonical envelopes update UI.
const stateConsumers=new Set();let currentState=null,stateGeneration=-1,stateRevision=-1;
const acceptState=value=>{
  if(value?.version!==1||!Number.isSafeInteger(value.generation)||!Number.isSafeInteger(value.revision)||!value.state)throw Error('Invalid workspace state delivery.');
  const newer=value.generation>stateGeneration||value.generation===stateGeneration&&value.revision>stateRevision;
  if(newer){
    currentState=value.state;stateGeneration=value.generation;stateRevision=value.revision;
    for(const callback of stateConsumers)callback(currentState);
  }
  // A stale push can follow a newer invoked read. Its state is already
  // superseded, but its exact delivery still needs releasing in the publisher.
  if(stateConsumers.size)ipcRenderer.send('musebench:state-ack',{generation:value.generation,revision:value.revision});
  return currentState;
};
ipcRenderer.on('musebench:update',(_event,value)=>{if(stateConsumers.size)acceptState(value);});
contextBridge.exposeInMainWorld('musebench', Object.freeze({
  launch: Object.freeze({active:launchActive,complete:()=>ipcRenderer.invoke('musebench:launch-complete')}),
  onboarding: command => ipcRenderer.invoke('musebench:onboarding',command),
  codeBilling: command => ipcRenderer.invoke('musebench:code-billing',command),
  onBillingChanged: callback => {const listener=()=>callback();ipcRenderer.on('musebench:billing-update',listener);return()=>ipcRenderer.removeListener('musebench:billing-update',listener);},
  appUpdate: command => ipcRenderer.invoke('musebench:app-update',command),
  backgroundEngine: command => ipcRenderer.invoke('musebench:background-engine',command),
  mobileDevice: command => ipcRenderer.invoke('musebench:mobile-device',command),
  nativeControl: command => ipcRenderer.invoke('musebench:native-control',command),
  nativeNavigationPhase: value => ipcRenderer.send('musebench:native-phase',value),
  onNativeCancel: callback => {const listener=(_event,value)=>callback(value.id);ipcRenderer.on('musebench:native-cancel',listener);return()=>ipcRenderer.removeListener('musebench:native-cancel',listener);},
  onNativeRequest: callback => {
    const active=new Map();let disposed=false;
    const cancel=(_event,value)=>{active.delete(value?.id);};
    const listener=async(_event,request)=>{
      if(!request||Date.now()>=request.deadline||disposed)return;active.set(request.id,true);
      try{
        if(!await ipcRenderer.invoke('musebench:native-claim',request.id)||!active.has(request.id)||Date.now()>=request.deadline||disposed)return;
        const result=await callback(request);
        if(active.has(request.id)&&Date.now()<request.deadline&&!disposed)ipcRenderer.send('musebench:native-reply',{id:request.id,result});
      }catch{if(active.has(request.id)&&Date.now()<request.deadline&&!disposed)ipcRenderer.send('musebench:native-reply',{id:request.id,error:true});}
      finally{active.delete(request.id);}
    };
    ipcRenderer.on('musebench:native-request',listener);ipcRenderer.on('musebench:native-cancel',cancel);
    return()=>{disposed=true;active.clear();ipcRenderer.removeListener('musebench:native-request',listener);ipcRenderer.removeListener('musebench:native-cancel',cancel);};
  },
  onAppUpdate: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('musebench:app-update-state',listener);return()=>ipcRenderer.removeListener('musebench:app-update-state',listener);},
  inspectWorktrees: input => ipcRenderer.invoke('musebench:worktrees',input),
  inspectProjectActions: input => ipcRenderer.invoke('musebench:project-actions',input),
  inspectRunChanges: input => ipcRenderer.invoke('musebench:run-changes',input),
  prepareRunFeedback: input => ipcRenderer.invoke('musebench:run-feedback',input),
  inspectPreviewTarget: input => ipcRenderer.invoke('musebench:preview-target',input),
  preparePreviewFeedback: input => ipcRenderer.invoke('musebench:preview-feedback',input),
  discardPreviewTarget: token => ipcRenderer.invoke('musebench:preview-discard',token),
  onPreviewInvalidated: callback => {const listener=()=>callback();ipcRenderer.on('musebench:preview-invalidated',listener);return()=>ipcRenderer.removeListener('musebench:preview-invalidated',listener);},
  importCodeImage: input => ipcRenderer.invoke('musebench:code-image-import',input),
  readCodeImage: input => ipcRenderer.invoke('musebench:code-image-read',input),
  copyText: text => ipcRenderer.invoke('musebench:copy-text', text),
  copyReply: text => ipcRenderer.invoke('musebench:copy-reply', text),
  windowControlsOverlay: process.platform === 'win32',
  setWindowTheme: theme => ipcRenderer.invoke('musebench:window-theme', theme),
  customize: command => ipcRenderer.invoke('musebench:customize', command),
  sitesState: () => ipcRenderer.invoke('musebench:sites-state'),
  sites: command => ipcRenderer.invoke('musebench:sites', command),
  sitesImport: replace => ipcRenderer.invoke('musebench:sites-import', replace),
  sitesReadFile: file => ipcRenderer.invoke('musebench:sites-read-file', file),
  sitesConnect: value => ipcRenderer.invoke('musebench:sites-connect', value),
  sitesAuthPoll: () => ipcRenderer.invoke('musebench:sites-auth-poll'),
  sitesOpen: target => ipcRenderer.invoke('musebench:sites-open', target),
  sitesCopyUrl: () => ipcRenderer.invoke('musebench:sites-copy-url'),
  onSitesState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('musebench:sites-update', listener); return () => ipcRenderer.removeListener('musebench:sites-update', listener); },
  spacesState: () => ipcRenderer.invoke('musebench:spaces-state'),
  spaces: command => ipcRenderer.invoke('musebench:spaces', command),
  spacesCopyInvitation: () => ipcRenderer.invoke('musebench:spaces-copy-invitation'),
  onSpacesState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('musebench:spaces-update', listener); return () => ipcRenderer.removeListener('musebench:spaces-update', listener); },
  workState: () => ipcRenderer.invoke('musebench:work-state'),
  work: command => ipcRenderer.invoke('musebench:work', command),
  workImport: () => ipcRenderer.invoke('musebench:work-import'),
  workExport: format => ipcRenderer.invoke('musebench:work-export', format),
  onWorkState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('musebench:work-update', listener); return () => ipcRenderer.removeListener('musebench:work-update', listener); },
  configureNotifications: value => ipcRenderer.invoke('musebench:notifications', value),
  analytics: options => ipcRenderer.invoke('musebench:analytics', options),
  commandInfo: type => ipcRenderer.invoke('musebench:command-info', type),
  inspectCodeContext: input => ipcRenderer.invoke('musebench:code-context',input),
  inspectCheckpoint: input => ipcRenderer.invoke('musebench:checkpoint',input),
  semanticNavigate: input => ipcRenderer.invoke('musebench:semantic-navigation',input),
  readCapturedOutput: input => ipcRenderer.invoke('musebench:captured-output',input),
  findChatHistory: input => ipcRenderer.invoke('musebench:chat-history-find',input),
  readChatHistory: input => ipcRenderer.invoke('musebench:chat-history',input),
  inspectDiscoverySources: input => ipcRenderer.invoke('musebench:discovery-sources',input),
  discoveryAuth: input => ipcRenderer.invoke('musebench:discovery-auth',input),
  onDiscoveryAuthUpdate: callback => {const listener=(_event,value)=>callback(value);ipcRenderer.on('musebench:discovery-auth-update',listener);return()=>ipcRenderer.removeListener('musebench:discovery-auth-update',listener);},
  readMcpServers: input => ipcRenderer.invoke('musebench:session-mcp',input),
  searchChats: input => ipcRenderer.invoke('musebench:chat-search',input),
  previewConversationImport: () => ipcRenderer.invoke('musebench:conversation-import-pick'),
  readImportPreview: input => ipcRenderer.invoke('musebench:conversation-import',{...input,type:'preview'}),
  searchImportPreview: input => ipcRenderer.invoke('musebench:conversation-import',{...input,type:'search'}),
  confirmConversationImport: input => ipcRenderer.invoke('musebench:conversation-import',{...input,type:'confirm'}),
  discardConversationImport: token => ipcRenderer.invoke('musebench:conversation-import',{type:'discard',token}),
  removeImportedConversation: id => ipcRenderer.invoke('musebench:conversation-import',{type:'remove',id}),
  readPromptShelf: input => ipcRenderer.invoke('musebench:prompt-shelf-read',input),
  transferCodeDraft: input => ipcRenderer.invoke('musebench:code-draft-transfer',input),
  listSavedPrompts: input => ipcRenderer.invoke('musebench:prompt-shelf-list',input),
  parkCodeDraft: input => ipcRenderer.invoke('musebench:prompt-shelf-park',input),
  restoreSavedPrompt: input => ipcRenderer.invoke('musebench:prompt-shelf-restore',input),
  removeSavedPrompt: input => ipcRenderer.invoke('musebench:prompt-shelf-remove',input),
  saveCodeDraft: input => ipcRenderer.invoke('musebench:code-draft',input),
  getState: async () => acceptState(await ipcRenderer.invoke('musebench:state')),
  dictation: command => ipcRenderer.invoke('musebench:dictation', command),
  onDictation: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('musebench:dictation-update', listener); return () => ipcRenderer.removeListener('musebench:dictation-update', listener); },
  dispatch: async action => {const reply=await ipcRenderer.invoke('musebench:action',action);acceptState(reply.snapshot);return reply.result;},
  chooseProject: () => ipcRenderer.invoke('musebench:choose-project'),
  openProjectFile: input => ipcRenderer.invoke('musebench:open-file', input),
  chooseBinary: () => ipcRenderer.invoke('musebench:choose-binary'),
  openExternal: url => ipcRenderer.invoke('musebench:external', url),
  personalState: () => ipcRenderer.invoke('musebench:personal-state'),
  personal: command => ipcRenderer.invoke('musebench:personal', command),
  onPersonalState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('musebench:personal-update', listener);
    return () => ipcRenderer.removeListener('musebench:personal-update', listener);
  },
  onPersonalShortcut: callback => {
    const listener = (_event, shortcut) => callback(shortcut);
    ipcRenderer.on('musebench:personal-shortcut', listener);
    return () => ipcRenderer.removeListener('musebench:personal-shortcut', listener);
  },
  onState: callback => {
    stateConsumers.add(callback);
    if(stateConsumers.size===1)void ipcRenderer.invoke('musebench:state-attach').catch(()=>{});
    let active=true;
    return () => {if(!active)return;active=false;stateConsumers.delete(callback);if(!stateConsumers.size)ipcRenderer.send('musebench:state-detach');};
  },
}));
