const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('musebench', Object.freeze({
  inspectWorktrees: input => ipcRenderer.invoke('musebench:worktrees',input),
  importCodeImage: input => ipcRenderer.invoke('musebench:code-image-import',input),
  readCodeImage: input => ipcRenderer.invoke('musebench:code-image-read',input),
  copyText: text => ipcRenderer.invoke('musebench:copy-text', text),
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
  commandInfo: type => ipcRenderer.invoke('musebench:command-info', type),
  inspectCodeContext: input => ipcRenderer.invoke('musebench:code-context',input),
  searchChats: input => ipcRenderer.invoke('musebench:chat-search',input),
  saveCodeDraft: input => ipcRenderer.invoke('musebench:code-draft',input),
  getState: () => ipcRenderer.invoke('musebench:state'),
  dictation: command => ipcRenderer.invoke('musebench:dictation', command),
  onDictation: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('musebench:dictation-update', listener); return () => ipcRenderer.removeListener('musebench:dictation-update', listener); },
  dispatch: action => ipcRenderer.invoke('musebench:action', action),
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
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('musebench:update', listener);
    return () => ipcRenderer.removeListener('musebench:update', listener);
  },
}));
