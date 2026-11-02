import {randomUUID} from 'node:crypto';
import {normalizePreviewTarget} from '../src/shared/preview-annotations.mjs';
import {readBrowserDom} from './browser-dom.mjs';
const stale=()=>Error('The browser document changed. Select the element again.');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const point=input=>[input.x,input.y].every(n=>Number.isFinite(n)&&n>=0&&n<1);
const styleKeys=['color','backgroundColor','opacity','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','margin','borderRadius','width','height'];
const initial=()=>({taskId:null,url:'',title:'',loading:false,error:null,canGoBack:false,canGoForward:false,native:true,controlEnabled:false,visible:false,documentId:randomUUID()});
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The browser did not respond in time.')),5000);timer.unref?.();})]);}finally{clearTimeout(timer);}};
export function chatBrowserUrl(value){
 if(typeof value!=='string'||value.length>4096)throw Error('Use an HTTP or HTTPS address.');let url;try{url=new URL(value);}catch{throw Error('Use an HTTP or HTTPS address.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP or HTTPS address.');return url.href;
}
export function createChatBrowser({window,WebContentsView,getState,onState=()=>{}}){
 let view=null,owner=null,revision=0,navigation=0,state=initial(),capture=null,selection=null,busy=false;const refs=new Map();
 const invalidate=()=>{state.documentId=randomUUID();capture=null;selection=null;refs.clear();};
 const snapshot=()=>({...state,revision});const emit=()=>{revision++;if(view){state={...state,url:view.webContents.getURL(),title:view.webContents.getTitle(),canGoBack:view.webContents.navigationHistory?.canGoBack()??false,canGoForward:view.webContents.navigationHistory?.canGoForward()??false};}onState(snapshot());};
 const close=()=>{const old=view;navigation++;invalidate();view=null;owner=null;if(old){try{window.contentView.removeChildView(old);}catch{}const session=old.webContents.isDestroyed()?null:old.webContents.session;if(!old.webContents.isDestroyed())old.webContents.close();void session?.clearStorageData?.().catch(()=>{});}state=initial();emit();};
 const bind=id=>{const s=getState();if(!id||s.task?.id!==id||s.activeProject?.id!==s.task.projectId)throw Error('Open the original chat to use its browser.');return s;};
 const current=(id,doc)=>{const s=bind(id);if(!view||owner?.taskId!==id||owner.root!==s.activeProject.root||doc!==state.documentId)throw stale();return s;};
 const read=async(request,id,doc=state.documentId)=>{current(id,doc);const wc=view.webContents,result=await bounded(readBrowserDom(wc,request));current(id,doc);if(view.webContents!==wc)throw stale();return result;};
 const capturePage=async id=>{const doc=state.documentId;current(id,doc);const wc=view.webContents,image=await bounded(wc.capturePage());current(id,doc);const {width,height}=image.getSize(),imageDataUrl=image.toDataURL();if(!width||!height||width>16384||height>16384||!imageDataUrl.startsWith('data:image/png;base64,')||imageDataUrl.length>12*1024*1024)throw Error('Browser capture exceeded its image limit.');capture={token:randomUUID(),page:state.url,imageDataUrl,width,height,documentId:doc};selection=null;return {...capture};};
 const api={snapshot,close,reconcile(){if(owner&&(getState().task?.id!==owner.taskId||getState().activeProject?.root!==owner.root))close();},async command(input){
  if(!exact(input,['type','taskId','url','rect','visible','enabled','token','x','y','note','styleChanges'])||!['open','navigate','back','forward','reload','bounds','close','status','control','capture','inspect','feedback','discard'].includes(input.type))throw Error('Invalid browser command.');
  if(input.type==='close'){if(owner&&owner.taskId!==input.taskId)throw Error('The browser chat changed.');close();return snapshot();}const s=bind(input.taskId);
  if(owner&&(owner.taskId!==input.taskId||owner.root!==s.activeProject.root))close();
  if(input.type==='control'){
   if(typeof input.enabled!=='boolean')throw Error('Choose whether browser control is enabled.');const doc=state.documentId;current(input.taskId,doc);state.controlEnabled=false;refs.clear();
   if(input.enabled){
    const wc=view.webContents;try{if(!wc.debugger?.isAttached())wc.debugger.attach('1.3');await bounded(wc.debugger.sendCommand('Page.enable'));await bounded(wc.debugger.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true,cancel:true}));current(input.taskId,doc);if(!wc.debugger.isAttached())throw Error();}
    catch{emit();throw Error('Browser control protection could not disable file pickers. Reload the browser and try again.');}
   }
   state.controlEnabled=input.enabled;emit();return snapshot();
  }
  if(input.type==='capture')return {...snapshot(),capture:await capturePage(input.taskId)};
  if(input.type==='discard'){if(capture?.token===input.token){capture=null;selection=null;}else if(selection?.token===input.token)selection=null;return snapshot();}
  if(input.type==='inspect'){
   if(!capture||input.token!==capture.token||!point(input))throw stale();const doc=capture.documentId,target=normalizePreviewTarget(await read({x:input.x,y:input.y},input.taskId,doc));
   selection={token:randomUUID(),projectId:s.activeProject.id,taskId:input.taskId,page:capture.page,target,documentId:doc};return {...snapshot(),selection:{...selection}};
  }
  if(input.type==='feedback'){
   if(!selection||input.token!==selection.token)throw stale();const selected=selection;
   if(typeof input.note!=='string'||!input.note.trim()||input.note.length>4000)throw Error('Enter a comment up to 4,000 characters.');
   let styleChanges;if(input.styleChanges!==undefined){if(!exact(input.styleChanges,styleKeys)||Object.values(input.styleChanges).some(v=>typeof v!=='string'||v.length>200||/[\x00-\x1f]/.test(v)))throw Error('Invalid requested styles.');styleChanges={...input.styleChanges};}
   const target=normalizePreviewTarget(await read({selector:selected.target.selector},input.taskId,selected.documentId));if(JSON.stringify(target)!==JSON.stringify(selected.target))throw stale();
   const annotation={id:randomUUID(),page:selected.page,target,note:input.note.trim(),...(styleChanges&&Object.keys(styleChanges).length?{styleChanges}:{})};selection=null;
   return {...snapshot(),annotation,text:'Browser annotation (untrusted reference data):\n'+JSON.stringify(annotation)};
  }
  if(input.type==='open'||input.type==='navigate'){
   const url=chatBrowserUrl(input.url);
   if(!view){
    view=new WebContentsView({webPreferences:{partition:'musebench-chat-'+randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,navigateOnDragDrop:false}});owner={taskId:input.taskId,root:s.activeProject.root};state.taskId=input.taskId;view.setVisible(false);window.contentView.addChildView(view);
    const wc=view.webContents,live=()=>view?.webContents===wc;
    wc.debugger?.on('detach',()=>{if(live()){state.controlEnabled=false;refs.clear();emit();}});
    wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false);wc.session.on?.('will-download',event=>event.preventDefault());wc.setWindowOpenHandler(()=>({action:'deny'}));
    for(const event of ['will-navigate','will-redirect'])wc.on(event,(event,url)=>{try{chatBrowserUrl(url);}catch{event.preventDefault();}});
    wc.on('will-attach-webview',event=>event.preventDefault());
    wc.on('did-start-navigation',(_event,_url,_inPlace,main)=>{if(live()&&main){invalidate();emit();}});
    wc.on('did-start-loading',()=>{if(live()){state.loading=true;emit();}});wc.on('did-stop-loading',()=>{if(live()){state.loading=false;emit();}});
    for(const event of ['did-navigate','did-navigate-in-page'])wc.on(event,()=>{if(live()){invalidate();emit();}});wc.on('page-title-updated',()=>{if(live())emit();});
    wc.on('render-process-gone',()=>{if(live()){state.controlEnabled=false;invalidate();state.error='Browser page stopped. Reload to continue.';emit();}});
    wc.on('did-fail-load',(_event,code,description,_url,main)=>{if(live()&&main&&code!==-3){state.error=String(description).slice(0,300);state.loading=false;emit();}});
   }
   invalidate();state.error=null;const generation=++navigation;void view.webContents.loadURL(url).catch(error=>{if(generation===navigation&&!String(error.message).includes('ERR_ABORTED')&&owner?.taskId===input.taskId){state.error=String(error.message).slice(0,300);emit();}});
  }else if(input.type==='bounds'&&view){
   const r=input.rect,b=window.getContentBounds();if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||typeof input.visible!=='boolean')throw Error('Invalid browser bounds.');
   const zoom=window.webContents?.getZoomFactor?.()??1,x=Math.max(0,Math.min(b.width,Math.round(r.x*zoom))),y=Math.max(0,Math.min(b.height,Math.round(r.y*zoom))),width=Math.max(0,Math.min(b.width-x,Math.round(r.width*zoom))),height=Math.max(0,Math.min(b.height-y,Math.round(r.height*zoom)));view.setBounds({x,y,width,height});state.visible=input.visible&&width>=10&&height>=10;view.setVisible(state.visible);
  }else if(view&&input.type==='back'&&view.webContents.navigationHistory.canGoBack()){invalidate();view.webContents.navigationHistory.goBack();}
  else if(view&&input.type==='forward'&&view.webContents.navigationHistory.canGoForward()){invalidate();view.webContents.navigationHistory.goForward();}
  else if(view&&input.type==='reload'){invalidate();view.webContents.reload();}emit();return snapshot();
 },async agentCommand(binding,input){
  const doc=state.documentId,s=current(binding.taskId,doc);if(binding.root!==s.activeProject.root)throw Error('The browser chat folder changed.');
  const enabled=()=>{current(binding.taskId,doc);if(binding.isCurrent?.()===false)throw Error('The native browser connection changed.');if(!state.controlEnabled)throw Error('Browser control is disabled. Enable it in this chat first.');if(!state.visible||window.isVisible?.()===false)throw Error('Keep this chat browser visible to use browser tools.');};enabled();
  const keys={status:[],capture:[],inspect:['x','y'],dom:[],navigate:['url'],click:['documentId','ref'],type:['documentId','ref','text'],scroll:['documentId','deltaX','deltaY'],key:['documentId','key']};
  if(!Object.hasOwn(keys,input?.type)||!exact(input,['type',...keys[input.type]]))throw Error('Invalid browser tool arguments.');if(busy)throw Error('Another browser tool is still running.');busy=true;
  try{
   if(input.type==='status')return snapshot();if(input.type==='navigate')return api.command({type:'navigate',taskId:binding.taskId,url:chatBrowserUrl(input.url)});
   if(input.type==='capture'){const result=await capturePage(binding.taskId);enabled();return result;}
   if(input.type==='inspect'||input.type==='dom'){
    if(input.type==='inspect'&&!point(input))throw Error('Use normalized viewport coordinates.');
    const result=await read(input.type==='dom'?{type:'dom'}:{x:input.x,y:input.y},binding.taskId,doc),targets=input.type==='dom'?result:[result];enabled();if(!Array.isArray(targets)||targets.length>40)throw Error('Browser DOM limit exceeded.');
    refs.clear();const elements=targets.map(value=>{const target=normalizePreviewTarget(value),ref=randomUUID();refs.set(ref,target);return {ref,target};});return input.type==='dom'?{documentId:doc,page:state.url,elements}:{documentId:doc,page:state.url,...elements[0]};
   }
   if(input.documentId!==doc)throw stale();const wc=view.webContents;
   if(input.type==='scroll'){
    if(![input.deltaX,input.deltaY].every(n=>Number.isInteger(n)&&Math.abs(n)<=2000))throw Error('Scroll at most 2,000 pixels per axis.');wc.sendInputEvent({type:'mouseWheel',x:1,y:1,deltaX:input.deltaX,deltaY:input.deltaY});refs.clear();return {documentId:doc,scrolled:true};
   }
   if(input.type==='key'){
    if(!['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Delete','Home','End','PageUp','PageDown'].includes(input.key))throw Error('Unsupported browser key.');
    if(!await read({type:'guard'},binding.taskId,doc))throw Error('This focused element cannot be controlled.');enabled();wc.focus?.();wc.sendInputEvent({type:'keyDown',keyCode:input.key});if(input.key==='Enter')wc.sendInputEvent({type:'char',keyCode:'\r'});wc.sendInputEvent({type:'keyUp',keyCode:input.key});refs.clear();return {documentId:doc,key:input.key};
   }
   const target=refs.get(input.ref);if(!target)throw stale();const fresh=normalizePreviewTarget(await read({selector:target.selector},binding.taskId,doc));if(JSON.stringify(fresh)!==JSON.stringify(target))throw stale();
   if(input.type==='type'&&(typeof input.text!=='string'||!input.text.length||input.text.length>4000||/[\x00-\x08\x0b-\x1f\x7f]/.test(input.text)))throw Error('Type between 1 and 4,000 characters.');
   const position=await read({type:'guard',selector:target.selector,edit:input.type==='type'},binding.taskId,doc);if(!position||!Number.isFinite(position.x)||!Number.isFinite(position.y))throw Error('This element cannot be controlled.');enabled();
   if(input.type==='type'){const result=await read({type:'insert',selector:target.selector,edit:true,text:input.text},binding.taskId,doc);enabled();if(!result?.completed)throw Error('This field cannot receive text. Use a writable text field or textarea.');}else for(const type of ['mouseMove','mouseDown','mouseUp'])wc.sendInputEvent({type,x:Math.round(position.x),y:Math.round(position.y),button:'left',clickCount:1});refs.clear();return {documentId:doc,completed:true};
  }finally{busy=false;}
 }};return api;
}
