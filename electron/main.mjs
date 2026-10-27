import {createBillingReader} from './billing-reader.mjs';
import {createOnboarding} from './onboarding.mjs';
import {createFileEditor} from './file-editor.mjs';
import {createWorkspaceMcpConfig} from './workspace-mcp-config.mjs';
import {createAppUpdates,createUpdateShutdown,updateBlocked} from './app-updates.mjs';
import updaterPackage from 'electron-updater';
import {existsSync} from 'node:fs';
import {customizeBlocked} from '../src/shared/customize-policy.mjs';
import {createCommandInfo,exportTranscript} from './command-info.mjs';
import {createCustomize} from './customize.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {createRunNotifier} from './notifications.mjs';
import {createWorkService} from '../src/work/index.mjs';
import {createDesktopSpaces} from './spaces.mjs';
import {createDesktopSites} from './sites.mjs';
import {createSitePreviewHandler,isSitePreviewUrl,sitePreviewNavigationDecision} from './sites-protocol.mjs';
import {renderArtifactHtml} from '../src/shared/work-artifacts.mjs';
import {artifactId,createArtifactHandler} from './work-protocol.mjs';
import {createWorkExporter} from './work-export.mjs';
import {writeFile} from 'node:fs/promises';
import {workDataDirectory} from './work-root.mjs';
import {createDictation} from './dictation.mjs';
import { app, BrowserWindow, WebContentsView, dialog, ipcMain, Menu, shell, session, nativeTheme, Notification, protocol, safeStorage, clipboard } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createController } from '../src/controller/index.mjs';
import {createCodeRuntime} from '../src/runtime/selector.mjs';
import { createRuntime } from '../src/runtime/index.mjs';
import { createExecRuntime } from '../src/runtime/exec.mjs';
import { allowedExternal, trustedSender, validateAction } from './security.mjs';
import { createPersonalBrowser } from './personal.mjs';
import { createStartupFailureHandler } from './startup.mjs';
import { titleBarOverlay, updateWindowTheme } from './window-chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataOverride = process.env.MUSEBENCH_DATA_DIR;
if (dataOverride && path.isAbsolute(dataOverride)) app.setPath('userData', dataOverride);
const dev = !app.isPackaged && process.env.MUSEBENCH_DEV === '1';
const uiURL = dev ? 'http://127.0.0.1:4318/' : pathToFileURL(path.join(root,'dist','index.html')).href;
protocol.registerSchemesAsPrivileged([{scheme:'musebench-artifact',privileges:{standard:true,secure:true}},{scheme:'musebench-site',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let window, controller, customize, personal, dictation, work, workExporter, spaces, sites, updates, closing = false, updateInstalling=false, updateShutdown, pendingIpc=0;
const startupFailed = createStartupFailureHandler({ app, dialog, getWindow: () => window });
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if(window) { if(window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    const helperPath = app.isPackaged ? path.join(process.resourcesPath,'native','MuseBenchJob.exe') : path.join(root,'native','bin','MuseBenchJob.exe');
    const dataDir = app.getPath('userData');
    const extensionReview=createExtensionReview({dataDir,profile:process.env.USERPROFILE});
    const workspaceMcp=createWorkspaceMcpConfig({appRoot:root});
    const runtimeFactory = () => process.platform === 'win32' ? createCodeRuntime({helperPath,extensionReview,workspaceMcp,durableSessions:true}) : createRuntime({extensionReview,workspaceMcp});
    const projectsOverride = process.env.MUSEBENCH_PROJECTS_DIR;
    // Muse 1.4.13 can stall before shell launch inside the user profile.
    // New working copies have their own location; saved originals stay put.
    const projectsDir = projectsOverride && path.isAbsolute(projectsOverride) ? projectsOverride
      : process.platform === 'win32' ? path.join(path.parse(dataDir).root,'MuseBenchWorkspaces',createHash('sha256').update(dataDir.toLowerCase()).digest('hex').slice(0,12)) : undefined;
    controller = await createController({ dataDir, projectsDir, newProjectsDir: projectsOverride && path.isAbsolute(projectsOverride) ? projectsOverride : path.join(app.getPath('documents'),'MuseBench'), templateDir: path.join(root,'templates','tea-store'), runtimeFactory });
    // Windows can redirect the app's known Roaming folder under its package
    // identity. Anchor Work's strict path checks to that trusted physical root.
    const workDataDir=await workDataDirectory(dataDir);
    work = await createWorkService({dataDir:workDataDir,projectsDir:path.join(projectsDir||path.join(dataDir,'projects'),'work'),runtime:process.platform==='win32'?createExecRuntime({helperPath,extensionReview}):createRuntime()});
    spaces=await createDesktopSpaces({dataDir:path.join(path.dirname(workDataDir),'spaces'),safeStorage,work});
    sites=await createDesktopSites({dataDir:path.join(path.dirname(workDataDir),'sites'),projectsDir:path.join(projectsDir||path.join(dataDir,'projects'),'sites'),runtime:process.platform==='win32'?createExecRuntime({helperPath,extensionReview}):createRuntime(),safeStorage,work,shell,clipboard});
    workExporter=createWorkExporter({BrowserWindow});
    const workCapabilities=await workExporter.capabilities();
    const workSnapshot=value=>({...value,capabilities:workCapabilities});
    protocol.handle('musebench-artifact',createArtifactHandler({getArtifact:async id=>(await work.getArtifact(id))??(await spaces.getArtifact(id)),render:renderArtifactHtml,getTheme:()=>nativeTheme.shouldUseDarkColors?'dark':'light'}));
    protocol.handle('musebench-site',createSitePreviewHandler({getBundle:(id,hash)=>sites.getBundle(id,hash)}));
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    window = new BrowserWindow({ width:1480, height:960, minWidth:390, minHeight:600, show:false, title:'MuseBench', icon:path.join(root,'electron','assets','musebench.ico'), backgroundColor:'#181818', autoHideMenuBar:true,
      ...(process.platform === 'win32' ? {titleBarStyle:'hidden',titleBarOverlay:titleBarOverlay('dark')} : {}),
      webPreferences:{preload:path.join(root,'electron','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:false,webSecurity:true,spellcheck:false} });
    dictation = createDictation({helperPath: app.isPackaged ? path.join(process.resourcesPath,'native','MuseBenchSpeech.exe') : path.join(root,'native','bin','MuseBenchSpeech.exe'), onState: value => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('musebench:dictation-update',value); }});
    window.on('close',event=>{if(updateShutdown?.preparing())event.preventDefault();});
    window.on('blur',()=>{ void dictation.stop(true).catch(()=>{}); });
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(url!==uiURL) event.preventDefault();});
    window.webContents.on('will-frame-navigate',event=>{
      if(event.isMainFrame){if(event.url!==uiURL)event.preventDefault();return;}
      const siteNavigation=sitePreviewNavigationDecision({url:event.url,frameUrl:event.frame?.url,initiatorUrl:event.initiator?.url,hostInitiated:event.initiator===window.webContents.mainFrame&&event.initiator?.url===uiURL});
      if(siteNavigation!==null){if(!siteNavigation)event.preventDefault();return;}
      if(artifactId(event.url)||isSitePreviewUrl(event.url))return;
      const previewURL=controller.getState().preview.url;
      try{if(!previewURL||new URL(event.url).origin!==new URL(previewURL).origin)event.preventDefault();}catch{event.preventDefault();}
    });
    window.webContents.on('will-attach-webview', event=>event.preventDefault());
    personal = createPersonalBrowser({ window, BrowserWindow, WebContentsView, session, shell,
      onState: state => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('musebench:personal-update', state); },
      onShortcut: shortcut => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('musebench:personal-shortcut', shortcut); },
    });
    const handler = (name, fn) => ipcMain.handle(name, async (event,...args) => {
      if (!trustedSender(event,window.webContents,uiURL)) throw Error('Workspace access is restricted to the main MuseBench window.');
      if(updateInstalling&&name!=='musebench:app-update')throw Error('MuseBench is restarting to install an update.');
      if(name==='musebench:app-update')return fn(...args);
      pendingIpc++;try{return await fn(...args);}finally{pendingIpc--;}
    });
    const openFileEditor=createFileEditor({dataDir,getState:()=>controller.getState(),choose:async()=>{
      const result=await dialog.showOpenDialog(window,{title:'Choose your preferred text editor',properties:['openFile'],filters:[{name:'Editor application',extensions:['exe']}]});
      return result.canceled?null:result.filePaths[0];
    }});
    handler('musebench:open-file',openFileEditor);
    handler('musebench:state',()=>controller.getState());
    handler('musebench:window-theme',theme=>updateWindowTheme(window,theme));
    handler('musebench:code-image-import',input=>controller.importImage(input));
    handler('musebench:code-image-read',input=>controller.readImage(input));
    handler('musebench:worktrees',input=>controller.inspectWorktrees(input));
    handler('musebench:code-context',input=>controller.inspectContext(input));
    handler('musebench:checkpoint',input=>controller.inspectCheckpoint(input));
    handler('musebench:semantic-navigation',input=>controller.semanticNavigate(input));
    handler('musebench:captured-output',input=>controller.readCapturedOutput(input));
    handler('musebench:chat-history',input=>controller.readChatHistory(input));
    handler('musebench:chat-search',input=>controller.searchChats(input));
    handler('musebench:code-draft',async input=>{const result=await controller.dispatch(validateAction({...input,type:'saveDraft'}));if(result.error)throw Error(result.error);});
    customize=createCustomize({getState:()=>controller.getState(),dataDir,review:extensionReview,isActive:()=>customizeBlocked(work.getState(),sites.getState(),sites.getState().generation),chooseFolder:async kind=>{const result=await dialog.showOpenDialog(window,{title:kind==='skills'?'Choose a skill folder containing SKILL.md':'Choose a local plugin bundle',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];}});
    const updateBusy=()=>pendingIpc>0||!controller.canRestartForUpdate()||customize.isBusy()||updateBlocked(controller.getState(),work.getState(),sites.getState(),sites.getState().generation);
    const {autoUpdater}=updaterPackage;
    autoUpdater.setFeedURL({provider:'github',owner:'FahadArfin',repo:'MuseBench',private:false});
    updateShutdown=createUpdateShutdown({isBusy:updateBusy,voice:()=>dictation.dispatch('status'),lock:value=>{updateInstalling=value;},closeServices:async()=>{
      closing=true;personal.close();
      const results=await Promise.allSettled([customize.close(),sites.close(),spaces.close(),controller.close(),work.close(),workExporter.close(),dictation.close()]);
      if(results.some(r=>r.status==='rejected'))throw Error('Shutdown needs attention');
    },verifyClosed:()=>!updateBlocked(controller.getState(),work.getState(),sites.getState())});
    updates=createAppUpdates({updater:autoUpdater,version:app.getVersion(),enabled:app.isPackaged&&process.platform==='win32'&&existsSync(path.join(path.dirname(app.getPath('exe')),'Uninstall MuseBench.exe')),isBusy:updateBusy,onState:value=>{if(window&&!window.isDestroyed())window.webContents.send('musebench:app-update-state',value);},prepareInstall:()=>updateShutdown.prepare()});
    handler('musebench:app-update',command=>updates.dispatch(command));
    updates.start();const updateStartup=setTimeout(()=>{void updates.dispatch('check').catch(()=>{});},15000);updateStartup.unref();
    handler('musebench:customize',command=>customize.dispatch(command));
    handler('musebench:sites-state',()=>sites.getState());
    handler('musebench:sites',command=>{if(customize.isBusy())throw Error('Wait for Customize to finish before starting another operation.');return sites.dispatch(command);});
    handler('musebench:sites-connect',value=>sites.connect(value));
    handler('musebench:sites-auth-poll',()=>sites.pollAuth());
    handler('musebench:sites-read-file',file=>sites.readFile(file));
    handler('musebench:sites-open',target=>sites.open(target));
    handler('musebench:sites-copy-url',()=>sites.copyUrl());
    handler('musebench:sites-import',async replace=>{
      if(replace!==undefined&&typeof replace!=='boolean')throw Error('Invalid site import.');
      const selected=replace?sites.getState().activeId:null;
      if(replace&&!selected)throw Error('Choose a site first.');
      const result=await dialog.showOpenDialog(window,{title:replace?'Replace site draft with a built folder':'Import a built static site folder',properties:['openDirectory']});
      if(result.canceled)return sites.getState();
      return sites.importFolder(result.filePaths[0],{replaceId:selected});
    });
    sites.subscribe(value=>{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:sites-update',value);});
    handler('musebench:spaces-state',()=>spaces.getState());
    handler('musebench:spaces',command=>spaces.dispatch(command));
    handler('musebench:spaces-copy-invitation',()=>{const invitation=spaces.getState().invitation;if(!invitation)throw Error('Create an invitation first.');clipboard.writeText(invitation.text);});
    spaces.subscribe(value=>{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:spaces-update',value);});
    handler('musebench:work-state',()=>workSnapshot(work.getState()));
    handler('musebench:work',async command=>{if(customize.isBusy())throw Error('Wait for Customize to finish before starting another operation.');return workSnapshot(await work.dispatch(command));});
    handler('musebench:work-import',async()=>{
      const selected=work.getState().activeId;
      const result=await dialog.showOpenDialog(window,{title:'Add sources to this work',properties:['openFile','multiSelections'],filters:[{name:'Data and text',extensions:['csv','json','md','txt']}]});
      if(result.canceled)return workSnapshot(work.getState());
      if(selected!==work.getState().activeId)throw Error('The selected work changed. Add the sources again.');
      return workSnapshot(await work.addSources(result.filePaths));
    });
    handler('musebench:work-export',async format=>{
      if(!['html','json','md','csv','pdf','mp4'].includes(format))throw Error('Unsupported export format.');
      const snapshot=work.getState(),artifact=snapshot.artifact;
      if(!artifact)throw Error('Create a preview before exporting.');
      if(format==='mp4'&&(artifact.kind!=='motion'||!workCapabilities.mp4))throw Error('MP4 export needs an animation and FFmpeg.');
      const name=artifact.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100).replace(/[. ]+$/g,'')||'MuseBench-work';
      const result=await dialog.showSaveDialog(window,{title:'Export work',defaultPath:name+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});
      if(result.canceled||!result.filePath)return{saved:false};
      return workExporter.export({artifact,format,filePath:result.filePath,theme:nativeTheme.shouldUseDarkColors?'dark':'light',updatedAt:snapshot.artifactUpdatedAt});
    });
    work.subscribe(value=>{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:work-update',workSnapshot(value));});
    const billingReader=createBillingReader({BrowserWindow,session,parent:window});
    window.on('closed',()=>billingReader.close());
    const commandInfo=createCommandInfo({extensionReview,getState:()=>controller.getState()});
    handler('musebench:command-info',async type=>{
      if(type==='billing'){billingReader.open();return{status:'ready'};}
      if(type==='usage'){const [result,billing]=await Promise.all([commandInfo(type),billingReader.read()]);return{...result,usage:{...(result.usage??{windows:[]}),billing,checkedAt:new Date().toISOString()}};}
      if(type==='skills')return commandInfo(type);
      if(type==='export'){
        const transcript=exportTranscript(controller.getState());
        const result=await dialog.showSaveDialog(window,{title:'Export chat',defaultPath:'MuseBench-chat.md',filters:[{name:'Markdown',extensions:['md']}]});
        if(result.canceled||!result.filePath)return{status:'cancelled'};
        await writeFile(result.filePath,transcript,'utf8');return{status:'ready'};
      }
      if(type==='mention'){
        const result=await dialog.showOpenDialog(window,{title:'Mention a project file',properties:['openFile']});
        return result.canceled?{status:'cancelled'}:{status:'ready',path:result.filePaths[0]};
      }
      if(type==='close'){window.close();return{status:'ready'};}
      throw Error('Unsupported command.');
    });
    const onboarding=createOnboarding({getBinary:()=>controller.getState().runtime.binary,getRuntime:()=>controller.getState().runtime,personal});
    handler('musebench:onboarding',command=>onboarding.command(command));
    window.once('closed',()=>onboarding.close());
    handler('musebench:personal-state',()=>personal.snapshot());
    handler('musebench:personal',async command=>{if(command?.type==='layout'&&command.visible)await dictation.stop(true);const result=await personal.dispatch(command);if(command?.type==='appearance')nativeTheme.themeSource=result.appearance.theme;return result;});
    handler('musebench:dictation',command=>{if(command==='start'&&!window.isFocused())throw Error('Focus MuseBench to start dictation.');return dictation.dispatch(command);});
    handler('musebench:copy-text',text=>{if(typeof text!=='string'||text.length>100000)throw Error('Invalid clipboard text.');clipboard.writeText(text);});
    handler('musebench:action',async action=>{const valid=validateAction(action);if(customize.isBusy()&&!['disconnectMuse','clearError'].includes(valid.type))throw Error('Wait for Customize to finish before starting another operation.');if(['createProject','openProject','selectProject','selectTask','newTask','createDemo','createCommandCopy'].includes(valid.type))await dictation.stop(true);return controller.dispatch(valid);});
    handler('musebench:choose-project', async()=>{const result=await dialog.showOpenDialog(window,{title:'Open a local project',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
    handler('musebench:choose-binary',async()=>{const result=await dialog.showOpenDialog(window,{title:'Select your official Muse CLI executable',properties:['openFile'],filters:[{name:'Muse CLI',extensions:process.platform==='win32'?['exe']:['*']}]});return result.canceled?null:result.filePaths[0];});
    handler('musebench:external',async url=>{if(!allowedExternal(url))throw Error('This external link is not supported.');await shell.openExternal(url);});
    const notifications=new Set();
    const notifier=createRunNotifier({report:(id,status)=>controller.recordDelivery(id,status),isFocused:()=>!window||window.isDestroyed()||window.isFocused(),send:(options,receipt)=>{
      if(!Notification.isSupported()){receipt.delivery('unsupported');return;}
      const notification=new Notification(options);notifications.add(notification);
      notification.on('click',()=>{if(!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}});
      notification.on('close',()=>notifications.delete(notification));
      notification.on('show',()=>receipt.delivery('shown'));
      notification.on('failed',()=>{receipt.delivery('failed');notifications.delete(notification);});
      notification.show();
      while(notifications.size>5){const oldest=notifications.values().next().value;notifications.delete(oldest);oldest.close();}
    }});
    notifier.observe(controller.getState());
    handler('musebench:notifications',value=>{notifier.configure(value);return{supported:Notification.isSupported()};});
    controller.subscribe(state=>{notifier.observe(state);if(window&&!window.isDestroyed())window.webContents.send('musebench:update',state);});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'MuseBench',submenu:[{label:'Open project…',accelerator:'CmdOrCtrl+O',click:async()=>{if(updateInstalling||closing||customize?.isBusy())return;pendingIpc++;try{const r=await dialog.showOpenDialog(window,{properties:['openDirectory']});if(!r.canceled&&!updateInstalling&&!closing){const next=await controller.dispatch({type:'openProject',path:r.filePaths[0]});if(!next.error&&!window.isDestroyed()){personal.hide();window.webContents.send('musebench:personal-shortcut','code');}}}finally{pendingIpc--;}}},{type:'separator'},{role:'quit'}]},
      {role:'editMenu'}, {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]},
    ]));
    window.once('ready-to-show',()=>window.show());
    await window.loadURL(uiURL);
  }).catch(startupFailed);
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(updateShutdown?.preparing()){event.preventDefault();return;}updates?.close();personal?.close();if(controller&&!closing){event.preventDefault();closing=true;Promise.allSettled([customize?.close(),sites?.close(),spaces?.close(),controller.close(),work?.close(),workExporter?.close(),dictation?.close()]).finally(()=>app.quit());}});
