import {randomUUID} from 'node:crypto';
export function chatBrowserUrl(value){
 if(typeof value!=='string'||value.length>4096)throw Error('Use an HTTP or HTTPS address.');let url;try{url=new URL(value);}catch{throw Error('Use an HTTP or HTTPS address.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP or HTTPS address.');return url.href;
}
export function createChatBrowser({window,WebContentsView,getState,onState=()=>{}}){
 let view=null,owner=null,revision=0,navigation=0,state={taskId:null,url:'',title:'',loading:false,error:null,canGoBack:false,canGoForward:false,native:true};
 const snapshot=()=>({...state,revision});const emit=()=>{revision++;if(view){state={...state,url:view.webContents.getURL(),title:view.webContents.getTitle(),canGoBack:view.webContents.navigationHistory?.canGoBack()??false,canGoForward:view.webContents.navigationHistory?.canGoForward()??false};}onState(snapshot());};
 const close=()=>{const old=view;navigation++;view=null;owner=null;if(old){try{window.contentView.removeChildView(old);}catch{}const session=old.webContents.isDestroyed()?null:old.webContents.session;if(!old.webContents.isDestroyed())old.webContents.close();void session?.clearStorageData?.().catch(()=>{});}state={taskId:null,url:'',title:'',loading:false,error:null,canGoBack:false,canGoForward:false,native:true};emit();};
 const bind=id=>{const s=getState();if(!id||s.task?.id!==id||s.activeProject?.id!==s.task.projectId)throw Error('Open the original chat to use its browser.');return s;};
 return{snapshot,close,reconcile(){if(owner&&(getState().task?.id!==owner.taskId||getState().activeProject?.root!==owner.root))close();},async command(input){
  if(!input||!['open','navigate','back','forward','reload','bounds','close','status'].includes(input.type)||Object.keys(input).some(k=>!['type','taskId','url','rect','visible'].includes(k)))throw Error('Invalid browser command.');
  if(input.type==='close'){if(owner&&owner.taskId!==input.taskId)throw Error('The browser chat changed.');close();return snapshot();}const s=bind(input.taskId);
  if(owner&&(owner.taskId!==input.taskId||owner.root!==s.activeProject.root))close();
  if(input.type==='open'||input.type==='navigate'){
   const url=chatBrowserUrl(input.url);
   if(!view){
    view=new WebContentsView({webPreferences:{partition:'musebench-chat-'+randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,navigateOnDragDrop:false}});owner={taskId:input.taskId,root:s.activeProject.root};state.taskId=input.taskId;view.setVisible(false);window.contentView.addChildView(view);
    const wc=view.webContents,live=()=>view?.webContents===wc;
    wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false);wc.session.on?.('will-download',event=>event.preventDefault());wc.setWindowOpenHandler(()=>({action:'deny'}));
    for(const event of ['will-navigate','will-redirect'])wc.on(event,(event,url)=>{try{chatBrowserUrl(url);}catch{event.preventDefault();}});
    wc.on('will-attach-webview',event=>event.preventDefault());
    wc.on('did-start-loading',()=>{if(live()){state.loading=true;emit();}});wc.on('did-stop-loading',()=>{if(live()){state.loading=false;emit();}});wc.on('did-navigate',()=>{if(live())emit();});wc.on('did-navigate-in-page',()=>{if(live())emit();});wc.on('page-title-updated',()=>{if(live())emit();});
    wc.on('did-fail-load',(_event,code,description,_url,main)=>{if(live()&&main&&code!==-3){state.error=String(description).slice(0,300);state.loading=false;emit();}});
   }
   state.error=null;const generation=++navigation;void view.webContents.loadURL(url).catch(error=>{if(generation===navigation&&!String(error.message).includes('ERR_ABORTED')&&owner?.taskId===input.taskId){state.error=String(error.message).slice(0,300);emit();}});
  }else if(input.type==='bounds'&&view){
   const r=input.rect,b=window.getContentBounds();if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||typeof input.visible!=='boolean')throw Error('Invalid browser bounds.');
   const zoom=window.webContents?.getZoomFactor?.()??1,x=Math.max(0,Math.min(b.width,Math.round(r.x*zoom))),y=Math.max(0,Math.min(b.height,Math.round(r.y*zoom))),width=Math.max(0,Math.min(b.width-x,Math.round(r.width*zoom))),height=Math.max(0,Math.min(b.height-y,Math.round(r.height*zoom)));view.setBounds({x,y,width,height});view.setVisible(input.visible&&width>=10&&height>=10);
  }else if(view&&input.type==='back'&&view.webContents.navigationHistory.canGoBack())view.webContents.navigationHistory.goBack();
  else if(view&&input.type==='forward'&&view.webContents.navigationHistory.canGoForward())view.webContents.navigationHistory.goForward();
  else if(view&&input.type==='reload')view.webContents.reload();emit();return snapshot();
 }};
}
