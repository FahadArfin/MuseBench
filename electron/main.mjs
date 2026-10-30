import {createDiscoveryMcpConfig} from './discovery-mcp-config.mjs';
import {createDiscoveryOAuthStore} from './discovery-oauth-store.mjs';
import {createDiscoveryOAuthFlow} from './discovery-oauth-flow.mjs';
import {createDiscoveryOAuthCallback} from './discovery-oauth-callback.mjs';
import {createDiscoveryOAuth} from './discovery-oauth.mjs';
import {createRemoteNetwork} from '../src/runtime/discovery-remote-network.mjs';
import {validateDiscoveryAuthCommand} from '../src/shared/discovery-auth.mjs';
import {createBackgroundEngine} from './background-engine.mjs';
import {createNativeControlRouter} from './native-control-router.mjs';
import {createBillingReader} from './billing-reader.mjs';
import {createCodeBilling} from './code-billing.mjs';
import {createBillingPayments} from './billing-payments.mjs';
import {createOnboarding} from './onboarding.mjs';
import {userProfile} from '../src/shared/platform.mjs';
import {createMobileHost} from './mobile-host.mjs';
import {createMobileService} from './mobile-service.mjs';
import {createNativeControlHost} from './native-control-host.mjs';
import {prepareNativeMcpConfig} from './native-mcp-cache.mjs';
import {createNativeControlService,createNativeRenderer} from './native-control-service.mjs';
import {createFileEditor} from './file-editor.mjs';
import {createDesktopPreviewAnnotations} from './preview-annotations.mjs';
import {createWorkspaceMcpConfig} from './workspace-mcp-config.mjs';
import {createAppUpdates,createUpdateShutdown,updateBlocked} from './app-updates.mjs';
import {readUpdateBlockers} from './update-readiness.mjs';
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
import { app, BrowserWindow, WebContentsView, dialog, ipcMain, Menu, Tray, shell, session, nativeTheme, Notification, protocol, safeStorage, clipboard, ClipboardItem } from 'electron';
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
import { createLaunchAnimation } from './launch-animation.mjs';
import { createSessionDurability } from './session-durability.mjs';
import { titleBarOverlay, updateWindowTheme } from './window-chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataOverride = process.env.MUSEBENCH_DATA_DIR;
if (dataOverride && path.isAbsolute(dataOverride)) app.setPath('userData', dataOverride);
const sessionDurability = createSessionDurability({ app });
const dev = !app.isPackaged && process.env.MUSEBENCH_DEV === '1';
const uiURL = dev ? 'http://127.0.0.1:4318/' : pathToFileURL(path.join(root,'dist','index.html')).href;
protocol.registerSchemesAsPrivileged([{scheme:'musebench-artifact',privileges:{standard:true,secure:true}},{scheme:'musebench-site',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let window, ui, openWindow, background, closeOwned, ownedWorkBusy, controller, customize, codeBilling, dictation, work, workExporter, spaces, sites, updates, mobileHost, nativeControl, closing=false, updateInstalling=false, updateShutdown, pendingIpc=0, opening=null, pendingQuit=false;
const retryPendingQuit=()=>{if(pendingQuit&&!opening&&pendingIpc===0){pendingQuit=false;setImmediate(()=>app.quit());}};
const startupFailed = createStartupFailureHandler({ app, dialog, getWindow: () => window });
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{void openWindow?.().catch(startupFailed);});
  app.on('activate',()=>{void openWindow?.().catch(startupFailed);});
  app.whenReady().then(async () => {
    const helperPath = app.isPackaged ? path.join(process.resourcesPath,'native','MuseBenchJob.exe') : path.join(root,'native','bin','MuseBenchJob.exe');
    const dataDir = app.getPath('userData');
    const extensionReview=createExtensionReview({dataDir,profile:userProfile()});
    const workspaceMcp=createWorkspaceMcpConfig({appRoot:root});
    let discoveryOAuth;
    const discoveryMcp=createDiscoveryMcpConfig({appRoot:root,helperPath,extensionReview,oauth:()=>discoveryOAuth});
    const discoveryStore=await createDiscoveryOAuthStore({dataDir,protection:{available:async()=>safeStorage.isEncryptionAvailable()&&!['basic_text','plaintext'].includes(safeStorage.getSelectedStorageBackend?.()),encrypt:text=>safeStorage.encryptStringAsync(text),decrypt:bytes=>safeStorage.decryptStringAsync(bytes)}});
    discoveryOAuth=createDiscoveryOAuth({store:discoveryStore,flow:createDiscoveryOAuthFlow({networkFactory:({url,limits})=>createRemoteNetwork({url},{limits})}),callbackFactory:createDiscoveryOAuthCallback,resolveSource:discoveryMcp.resolveAuthSource,getSourceSnapshot:discoveryMcp.getAuthSourceSnapshot,ownerSnapshot:()=>controller?.discoveryOwnerSnapshot(),runtimeOwnerSnapshot:discoveryMcp.runtimeOwnerSnapshot,admitSourceMutation:id=>!controller||controller.discoverySourceBusy(id)?null:discoveryMcp.admitSourceMutation(id),withIdleLease:discoveryMcp.withIdleLease,openBrowser:url=>shell.openExternal(url),onSafeUpdate:event=>{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:discovery-auth-update',event);}});
    codeBilling=await createCodeBilling({dataDir,safeStorage,getBinary:()=>controller?.getState().runtime.binary,isActive:()=>!!ui?.onboarding?.isBusy()||!!customize?.isBusy()||controller&&!controller.canRestartForUpdate()||updateBlocked(work?.getState(),sites?.getState(),sites?.getState().generation),beforeChange:()=>controller.resetCodeConnections(),readBilling:()=>{if(!ui?.billingReader)throw Error('Open MuseBench to read billing.');return ui.billingReader.read();}});
    const runtimeFactory = () => process.platform === 'win32' ? createCodeRuntime({credentials:codeBilling.credentials,helperPath,extensionReview,workspaceMcp,discoveryMcp,durableSessions:true}) : createRuntime({credentials:codeBilling.credentials,extensionReview,workspaceMcp,discoveryMcp});
    const projectsOverride = process.env.MUSEBENCH_PROJECTS_DIR;
    // Muse 1.4.13 can stall before shell launch inside the user profile.
    // New working copies have their own location; saved originals stay put.
    const projectsDir = projectsOverride && path.isAbsolute(projectsOverride) ? projectsOverride
      : process.platform === 'win32' ? path.join(path.parse(dataDir).root,'MuseBenchWorkspaces',createHash('sha256').update(dataDir.toLowerCase()).digest('hex').slice(0,12)) : undefined;
    controller = await createController({ dataDir, projectsDir, newProjectsDir: projectsOverride && path.isAbsolute(projectsOverride) ? projectsOverride : path.join(app.getPath('documents'),'MuseBench'), templateDir: path.join(root,'templates','tea-store'), runtimeFactory,discoveryOAuth:()=>discoveryOAuth });
    // Windows can redirect the app's known Roaming folder under its package
    // identity. Anchor Work's strict path checks to that trusted physical root.
    const workDataDir=await workDataDirectory(dataDir);
    work = await createWorkService({dataDir:workDataDir,projectsDir:path.join(projectsDir||path.join(dataDir,'projects'),'work'),runtime:process.platform==='win32'?createExecRuntime({helperPath,extensionReview}):createRuntime({extensionReview})});
    spaces=await createDesktopSpaces({dataDir:path.join(path.dirname(workDataDir),'spaces'),safeStorage,work});
    sites=await createDesktopSites({dataDir:path.join(path.dirname(workDataDir),'sites'),projectsDir:path.join(projectsDir||path.join(dataDir,'projects'),'sites'),runtime:process.platform==='win32'?createExecRuntime({helperPath,extensionReview}):createRuntime({extensionReview}),safeStorage,work,shell,clipboard});
    workExporter=createWorkExporter({BrowserWindow});
    let workCapabilities={mp4:false};
    const workSnapshot=value=>({...value,capabilities:workCapabilities});
    const publishWork=value=>{if(!closing&&window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:work-update',workSnapshot(value));};
    // Optional executable discovery can take seconds on a slow PATH. It must
    // not delay the first window or launch animation; MP4 stays unavailable
    // until the probe finishes, and export awaits this same result.
    const workCapabilitiesReady=Promise.resolve().then(()=>workExporter.capabilities()).then(value=>{
      workCapabilities=value;
      if(!closing)publishWork(work.getState());
      return workCapabilities;
    }).catch(()=>workCapabilities);
    protocol.handle('musebench-artifact',createArtifactHandler({getArtifact:async id=>(await work.getArtifact(id))??(await spaces.getArtifact(id)),render:renderArtifactHtml,getTheme:()=>nativeTheme.shouldUseDarkColors?'dark':'light'}));
    protocol.handle('musebench-site',createSitePreviewHandler({getBundle:(id,hash)=>sites.getBundle(id,hash)}));
    sessionDurability.track(session.defaultSession);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);

    dictation = createDictation({helperPath: app.isPackaged ? path.join(process.resourcesPath,'native','MuseBenchSpeech.exe') : path.join(root,'native','bin','MuseBenchSpeech.exe'), onState: value => { if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('musebench:dictation-update',value); }});
    customize=createCustomize({getState:()=>controller.getState(),dataDir,review:extensionReview,isActive:()=>customizeBlocked(work.getState(),sites.getState(),sites.getState().generation),chooseFolder:async kind=>{if(!window||window.isDestroyed())throw Error('Open MuseBench to choose a folder.');const result=await dialog.showOpenDialog(window,{title:kind==='skills'?'Choose a skill folder containing SKILL.md':'Choose a local plugin bundle',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];}});
    mobileHost=await createMobileHost({dataDir,protection:safeStorage,service:createMobileService({controller,isBlocked:()=>closing||updateInstalling||customize.isBusy()||!!ui?.onboarding?.isBusy()})});
    ownedWorkBusy=()=>discoveryOAuth.isBusy()||nativeControl?.isBusy()||mobileHost.isBusy()||codeBilling.isBusy()||ui?.onboarding?.isBusy()||!controller.canRestartForUpdate()||customize.isBusy()||updateBlocked(controller.getState(),work.getState(),sites.getState(),sites.getState().generation,dictation.snapshot());
    const updateBusy=()=>pendingIpc>0||ownedWorkBusy();
    const updateBlockers=()=>readUpdateBlockers({controller,work,sites,dictation,operations:()=>[['tool-signin','Tool sign-in',discoveryOAuth.isBusy()],['app-control','App control',nativeControl?.isBusy()],['mobile','Mobile connection',mobileHost.isBusy()],['billing','Billing source change',codeBilling.isBusy()],['signin','Sign-in',ui?.onboarding?.isBusy()],['customize','Customize',customize.isBusy()],['app-action','App action',pendingIpc>0]]});
    let firstWindow=true,blockedDialog=false,pendingWindowClose=false;
    const showBlocked=async message=>{if(blockedDialog||closing)return;blockedDialog=true;try{await openWindow();await dialog.showMessageBox(window,{type:'info',title:'MuseBench is still working',message,detail:updateBlockers().map(row=>row.label+': '+row.detail).join('\n'),buttons:['Keep running']});}finally{blockedDialog=false;}};
    openWindow=()=>{
      if(closing||updateInstalling)return Promise.reject(Error('MuseBench is closing or updating.'));
      if(opening)return opening;
      if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();return Promise.resolve(window);}
      opening=(async()=>{
    window = new BrowserWindow({ width:1480, height:960, minWidth:390, minHeight:600, show:false, title:'MuseBench', icon:path.join(root,'electron','assets','musebench.ico'), backgroundColor:'#181818', autoHideMenuBar:true,
      ...(process.platform === 'win32' ? {titleBarStyle:'hidden',titleBarOverlay:titleBarOverlay('dark')} : {}),
      webPreferences:{preload:path.join(root,'electron','preload.cjs'),additionalArguments:['--musebench-launch-animation'],contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:false,webSecurity:true,spellcheck:false} });
        const ownWindow=window,view={window:ownWindow};ui=view;
        ownWindow.once('closed',()=>{if(window===ownWindow)window=null;});
        try{await attachWindow(ownWindow,view);firstWindow=false;return ownWindow;}catch(error){ownWindow.destroy();throw error;}
      })().finally(()=>{opening=null;retryPendingQuit();if(pendingWindowClose){pendingWindowClose=false;const requestedWindow=window;if(requestedWindow&&!requestedWindow.isDestroyed())setImmediate(()=>{if(!requestedWindow.isDestroyed())requestedWindow.close();});}});return opening;
    };
    background=await createBackgroundEngine({dataDir,windowOpen:()=>!!window&&!window.isDestroyed(),openWindow,quit:()=>app.quit(),isBusy:updateBusy,onBlocked:message=>{void showBlocked(message).catch(()=>{});},createTray:actions=>{
      const tray=new Tray(path.join(root,'electron','assets',process.platform==='win32'?'musebench.ico':'musebench.png'));
      tray.setToolTip('MuseBench — running in the background');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open MuseBench',click:actions.open},{type:'separator'},{label:'Quit MuseBench',click:actions.quit}]));tray.on('click',actions.open);return tray;
    }});
    const nativeRouter=createNativeControlRouter({app,controller,getView:()=>ui?.nativeService,getBackground:()=>background.snapshot(),isBlocked:()=>closing||updateInstalling||customize.isBusy()||codeBilling.isBusy()||!!ui?.onboarding?.isBusy()});
    nativeControl=await createNativeControlHost({dataDir,service:nativeRouter,connectionConfig:()=>prepareNativeMcpConfig({dataDir,executable:process.execPath,appRoot:root})});
    closeOwned=async()=>{
      closing=true;ui?.personal?.close();ui?.billingReader?.close();ui?.billingPayments?.close();ui?.onboarding?.close();await discoveryOAuth.close();await discoveryStore.close();
      const results=await Promise.allSettled([nativeControl.close(),mobileHost.close(),customize.close(),sites.close(),spaces.close(),controller.close(),work.close(),workExporter.close(),dictation.close(),background.close()]);
      for(const notification of notifications)notification.close();notifications.clear();
      await sessionDurability.close();if(results.some(r=>r.status==='rejected'))throw Error('Shutdown needs attention');
    };
    const {autoUpdater}=updaterPackage;
    autoUpdater.setFeedURL({provider:'github',owner:'FahadArfin',repo:'MuseBench',private:false});
    updateShutdown=createUpdateShutdown({isBusy:updateBusy,voice:()=>dictation.dispatch('status'),lock:value=>{updateInstalling=value;},closeServices:closeOwned,verifyClosed:()=>!updateBlocked(controller.getState(),work.getState(),sites.getState())});
    updates=createAppUpdates({updater:autoUpdater,version:app.getVersion(),enabled:app.isPackaged&&(process.platform==='win32'&&existsSync(path.join(path.dirname(app.getPath('exe')),'Uninstall MuseBench.exe'))||process.platform==='linux'&&!!process.env.APPIMAGE),isBusy:updateBusy,getBlockers:updateBlockers,onState:value=>{if(window&&!window.isDestroyed())window.webContents.send('musebench:app-update-state',value);},prepareInstall:()=>updateShutdown.prepare()});
    updates.start();const updateStartup=setTimeout(()=>{void updates.dispatch('check').catch(()=>{});},15000);updateStartup.unref();
    const notifications=new Set();
    const notifier=createRunNotifier({report:(id,status)=>controller.recordDelivery(id,status),isFocused:()=>!!window&&!window.isDestroyed()&&window.isFocused(),send:(options,receipt)=>{
      if(!Notification.isSupported()){receipt.delivery('unsupported');return;}
      const notification=new Notification(options);notifications.add(notification);
      notification.on('click',()=>{void openWindow?.().catch(()=>{});});
      notification.on('close',()=>notifications.delete(notification));
      notification.on('show',()=>receipt.delivery('shown'));
      notification.on('failed',()=>{receipt.delivery('failed');notifications.delete(notification);});
      notification.show();
      while(notifications.size>5){const oldest=notifications.values().next().value;notifications.delete(oldest);oldest.close();}
    }});
    notifier.observe(controller.getState());

    sites.subscribe(value=>{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:sites-update',value);});
    spaces.subscribe(value=>{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:spaces-update',value);});
    work.subscribe(publishWork);
    controller.subscribe(state=>{notifier.observe(state);if(window&&!window.isDestroyed())window.webContents.send('musebench:update',state);});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'MuseBench',submenu:[{label:'Open project…',accelerator:'CmdOrCtrl+O',click:async()=>{if(updateInstalling||closing||customize?.isBusy())return;await openWindow();pendingIpc++;try{const r=await dialog.showOpenDialog(window,{properties:['openDirectory']});if(!r.canceled&&!updateInstalling&&!closing){const next=await controller.dispatch({type:'openProject',path:r.filePaths[0]});if(!next.error&&!window.isDestroyed()){ui?.personal.hide();window.webContents.send('musebench:personal-shortcut','code');}}}finally{pendingIpc--;retryPendingQuit();}}},{type:'separator'},{role:'quit'}]},
      {role:'editMenu'}, {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]},
    ]));

    async function attachWindow(window,view){

    window.on('close',event=>{
      if(closing)return;
      if(updateShutdown?.preparing()){event.preventDefault();return;}
      if(codeBilling.isBusy()||view.onboarding?.isBusy()||updateBlocked(dictation.snapshot())){
        event.preventDefault();void showBlocked('Finish sign-in, dictation or active work before closing MuseBench. Background mode can keep Code work running.').catch(()=>{});return;
      }
      if(opening){event.preventDefault();pendingWindowClose=true;return;}
      if(pendingIpc>0){event.preventDefault();view.closeAfterIpc=true;return;}
      if(!background.snapshot().enabled&&ownedWorkBusy()){
        event.preventDefault();void showBlocked('Finish or stop active work before closing MuseBench, or enable background mode in General settings.').catch(()=>{});
      }
    });
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
    const personal = view.personal = createPersonalBrowser({ window, BrowserWindow, WebContentsView, session, shell,
      onState: state => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('musebench:personal-update', state); },
      onShortcut: shortcut => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('musebench:personal-shortcut', shortcut); },
    });
    const launch = createLaunchAnimation({setHeld: held => personal.setLaunchHold(held)});
    if(!firstWindow)launch.complete();
    personal.preloadInitial();
    // Preload needs this one boolean before the renderer's first paint. The
    // synchronous handler only consumes an in-memory ticket; it does no I/O.
    const claimLaunch = event => { event.returnValue = trustedSender(event,window.webContents,uiURL) && launch.claim(); };
    ipcMain.on('musebench:launch-claim',claimLaunch);
    let initialNavigation = true;
    window.webContents.on('did-start-navigation',(event,_url,inPlace,isMainFrame)=>{
      if (!(event.isMainFrame ?? isMainFrame) || (event.isInPlace ?? inPlace)) return;
      if (!initialNavigation) launch.complete();
      initialNavigation = false;
    });
    window.webContents.on('render-process-gone',()=>launch.complete());
    window.once('closed',()=>{launch.close();ipcMain.removeListener('musebench:launch-claim',claimLaunch);});
    const handlers=[];
    const handler = (name, fn) => {handlers.push(name);ipcMain.handle(name, async (event,...args) => {
      if (!trustedSender(event,window.webContents,uiURL)) throw Error('Workspace access is restricted to the main MuseBench window.');
      if(updateInstalling&&name!=='musebench:app-update')throw Error('MuseBench is restarting to install an update.');
      if((codeBilling.isBusy()||onboarding?.isBusy())&&['musebench:action','musebench:work','musebench:sites','musebench:customize'].includes(name))throw Error('Finish the billing source change or sign-in before starting work.');
      if(name==='musebench:app-update')return fn(...args);
      pendingIpc++;try{return await fn(...args);}finally{pendingIpc--;retryPendingQuit();if(pendingIpc===0&&view.closeAfterIpc){view.closeAfterIpc=false;setImmediate(()=>{if(!window.isDestroyed())window.close();});}}
    });};
    handler('musebench:background-engine',command=>background.command(command));
    handler('musebench:launch-complete',()=>launch.complete());
    const openFileEditor=createFileEditor({dataDir,getState:()=>controller.getState(),choose:async()=>{
      const result=await dialog.showOpenDialog(window,{title:'Choose your preferred text editor',properties:['openFile'],...(process.platform==='win32'?{filters:[{name:'Editor application',extensions:['exe']}]}:{})});
      return result.canceled?null:result.filePaths[0];
    }});
    handler('musebench:open-file',openFileEditor);
    handler('musebench:state',()=>controller.getState());
    handler('musebench:window-theme',theme=>updateWindowTheme(window,theme));
    handler('musebench:code-image-import',input=>controller.importImage(input));
    handler('musebench:code-image-read',input=>controller.readImage(input));
    handler('musebench:worktrees',input=>controller.inspectWorktrees(input));
    handler('musebench:project-actions',input=>controller.inspectProjectActions(input));
    handler('musebench:run-changes',input=>controller.inspectRunChanges(input));
    handler('musebench:run-feedback',input=>controller.prepareRunFeedback(input));
    const previewAnnotations=createDesktopPreviewAnnotations({contents:window.webContents,getState:()=>controller.getState(),onInvalidate:()=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('musebench:preview-invalidated');}});
    handler('musebench:preview-target',input=>previewAnnotations.inspect(input));
    handler('musebench:preview-feedback',input=>previewAnnotations.feedback(input));
    handler('musebench:preview-discard',token=>previewAnnotations.discard(token));
    window.once('closed',()=>previewAnnotations.close());
    handler('musebench:code-context',input=>controller.inspectContext(input));
    handler('musebench:checkpoint',input=>controller.inspectCheckpoint(input));
    handler('musebench:semantic-navigation',input=>controller.semanticNavigate(input));
    handler('musebench:captured-output',input=>controller.readCapturedOutput(input));
    handler('musebench:chat-history',input=>controller.readChatHistory(input));
    handler('musebench:discovery-sources',input=>controller.inspectDiscoverySources(input));
    handler('musebench:discovery-auth',input=>controller.discoveryAuth(validateDiscoveryAuthCommand(input)));
    handler('musebench:session-mcp',input=>controller.readMcpServers(input));
    handler('musebench:chat-search',input=>controller.searchChats(input));
    handler('musebench:conversation-import-pick',async()=>{
      const result=await dialog.showOpenDialog(window,{title:'Import conversations',properties:['openFile'],filters:[{name:'Conversation exports',extensions:['json','zip','md','txt']}]});
      return result.canceled?null:controller.prepareConversationImport(result.filePaths[0]);
    });
    handler('musebench:conversation-import',input=>controller.conversationImport(input));
    handler('musebench:code-draft',input=>controller.saveCodeDraft(validateAction({...input,type:'saveDraft'})));
    handler('musebench:mobile-device',command=>mobileHost.command(command));
    const nativeRenderer=createNativeRenderer({window,ipcMain,trusted:event=>trustedSender(event,window.webContents,uiURL)});
    const nativeService=view.nativeService=createNativeControlService({app,window,controller,personal,renderer:nativeRenderer,isBlocked:()=>closing||updateInstalling||window.webContents.isLoading()||customize.isBusy()||codeBilling.isBusy()||!!onboarding?.isBusy()});
    handler('musebench:native-control',command=>nativeControl.command(command));
    handler('musebench:app-update',command=>updates.dispatch(command));
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
    handler('musebench:spaces-state',()=>spaces.getState());
    handler('musebench:spaces',command=>spaces.dispatch(command));
    handler('musebench:spaces-copy-invitation',()=>{const invitation=spaces.getState().invitation;if(!invitation)throw Error('Create an invitation first.');return clipboard.writeText(invitation.text);});
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
      if(format==='mp4')await workCapabilitiesReady;
      if(closing||window.isDestroyed())throw Error('MuseBench is closing. Export again after reopening it.');
      const snapshot=work.getState(),artifact=snapshot.artifact;
      if(!artifact)throw Error('Create a preview before exporting.');
      if(format==='mp4'&&(artifact.kind!=='motion'||!workCapabilities.mp4))throw Error('MP4 export needs an animation and FFmpeg.');
      const name=artifact.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100).replace(/[. ]+$/g,'')||'MuseBench-work';
      const result=await dialog.showSaveDialog(window,{title:'Export work',defaultPath:name+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});
      if(result.canceled||!result.filePath)return{saved:false};
      return workExporter.export({artifact,format,filePath:result.filePath,theme:nativeTheme.shouldUseDarkColors?'dark':'light',updatedAt:snapshot.artifactUpdatedAt});
    });
    const billingReader=view.billingReader=createBillingReader({BrowserWindow,session,parent:window});
    const billingChanged=()=>{if(!window.isDestroyed())window.webContents.send('musebench:billing-update');};
    const billingPayments=view.billingPayments=createBillingPayments({BrowserWindow,session,shell,parent:window,onClosed:billingChanged});
    window.on('closed',()=>billingReader.close());
    window.on('closed',()=>billingPayments.close());
    handler('musebench:code-billing',async command=>{
      if(command?.type==='checkout')return billingPayments.open(command);
      const result=await codeBilling.command(command);if(command.type!=='status')billingChanged();return{state:result};
    });
    const commandInfo=createCommandInfo({extensionReview,getState:()=>controller.getState()});
    handler('musebench:analytics',options=>controller.readAnalytics({days:options?.days,offset:options?.offset}));
    handler('musebench:command-info',async type=>{
      if(type==='billing'){billingReader.open();return{status:'ready'};}
      if(type==='usage'){const [account,billing]=await Promise.all([codeBilling.status(),billingReader.read()]);return{status:account.status,message:account.message,usage:{...account.usage,billing,billingSource:account.source,billingMatched:account.source==='api'&&!!billing?.accountId&&account.billingAccountId===billing.accountId,checkedAt:new Date().toISOString()}};}
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
      if(type==='close'){setImmediate(()=>{if(!window.isDestroyed())window.close();});return{status:'ready'};}
      throw Error('Unsupported command.');
    });
    const onboarding=view.onboarding=createOnboarding({getBinary:()=>controller.getState().runtime.binary,getRuntime:()=>controller.getState().runtime,personal});
    handler('musebench:onboarding',async command=>{
      if(command?.type==='apiKey'){await codeBilling.command({type:'saveApiKey',key:command.key});billingChanged();return{code:{status:'ready',method:'api'},personal:{status:'unknown'}};}
      if(command?.type==='loginCode')return codeBilling.signIn(()=>onboarding.command(command));
      return onboarding.command(command);
    });
    window.once('closed',()=>onboarding.close());
    handler('musebench:personal-state',()=>personal.snapshot());
    handler('musebench:personal',async command=>{if(command?.type==='layout'&&command.visible)await dictation.stop(true);const result=await personal.dispatch(command);if(command?.type==='appearance')nativeTheme.themeSource=result.appearance.theme;return result;});
    handler('musebench:dictation',command=>{if(command==='start'&&!window.isFocused())throw Error('Focus MuseBench to start dictation.');return dictation.dispatch(command);});
    handler('musebench:copy-text',text=>{if(typeof text!=='string'||text.length>100000)throw Error('Invalid clipboard text.');return clipboard.writeText(text);});
    handler('musebench:copy-reply',async text=>{const {replyClipboard}=await import('../src/shared/reply-copy.mjs');const value=replyClipboard(text);await clipboard.write([new ClipboardItem({'text/plain':value.text,'text/html':value.html})]);});
    handler('musebench:action',async action=>{const valid=validateAction(action);if(customize.isBusy()&&!['disconnectMuse','clearError'].includes(valid.type))throw Error('Wait for Customize to finish before starting another operation.');if(['createProject','openProject','selectProject','selectTask','newTask','createDemo','createCommandCopy'].includes(valid.type))await dictation.stop(true);return controller.dispatch(valid);});
    handler('musebench:choose-project', async()=>{const result=await dialog.showOpenDialog(window,{title:'Open a local project',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
    handler('musebench:choose-binary',async()=>{const result=await dialog.showOpenDialog(window,{title:'Select your official Muse CLI executable',properties:['openFile'],filters:[{name:'Muse CLI',extensions:process.platform==='win32'?['exe']:['*']}]});return result.canceled?null:result.filePaths[0];});
    handler('musebench:external',async url=>{if(!allowedExternal(url))throw Error('This external link is not supported.');await shell.openExternal(url);});
    handler('musebench:notifications',value=>{notifier.configure(value);return{supported:Notification.isSupported()};});
    window.once('closed',()=>{for(const name of handlers)ipcMain.removeHandler(name);nativeService.close();personal.close();if(ui===view){ui=null;} });
    window.once('ready-to-show',()=>{if(!window.isDestroyed())window.show();});
    await window.loadURL(uiURL);
    }
    await openWindow();
  }).catch(startupFailed);
}
app.on('window-all-closed',()=>{if(background)background.windowClosed();else app.quit();});
// Installation preparation may fail after services close. Keep its state and
// error listener alive until Electron confirms the final quit.
app.on('will-quit',()=>updates?.close());
app.on('before-quit',event=>{
  if(updateShutdown?.preparing()){event.preventDefault();return;}
  if(closing)return;
  if((opening||pendingIpc>0)&&!ui?.onboarding?.isBusy()&&!codeBilling?.isBusy()&&!updateBlocked(dictation?.snapshot())){event.preventDefault();pendingQuit=true;return;}
  if(background&&!background.beforeQuit(event))return;
  event.preventDefault();closing=true;
  Promise.resolve().then(()=>closeOwned?.()).catch(()=>{}).finally(()=>app.quit());
});
