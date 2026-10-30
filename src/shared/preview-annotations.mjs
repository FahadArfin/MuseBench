// Ephemeral, read-only evidence. Neither adapter can dispatch model work.
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const clean=value=>value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
const stale=()=>Error('The preview changed. Select the element again.');
function fields(value,allowed){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Invalid preview selection.');}
export function validatePreviewPoint(value){
 fields(value,['projectId','taskId','frameName','x','y']);
 if(!id(value.projectId)||!id(value.taskId)||!/^musebench-project-preview-[a-f0-9-]{36}$/.test(value.frameName??'')||![value.x,value.y].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw Error('Choose a visible preview element.');
 return {...value};
}
export function previewPageUrl(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.href.length>4000)throw Error('Only the running local project preview can be annotated.');
 return url.origin+url.pathname;
}
export function normalizePreviewTarget(value){
 if(!plain(value)||typeof value.selector!=='string'||value.selector.length>1024||!/^html(?: > [a-z][a-z0-9-]*(?::nth-of-type\([1-9]\d{0,5}\))?){1,15}$/.test(value.selector)||!(/^[a-z][a-z0-9-]{0,31}$/.test(value.tag??''))||typeof value.title!=='string'||value.title.length>160||typeof value.text!=='string'||value.text.length>600||!plain(value.rect))throw Error('Select a visible element in the preview.');
 const {x,y,width,height}=value.rect;
 if(![x,y,width,height].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!width||!height||x+width>1.001||y+height>1.001)throw Error('Select a visible element in the preview.');
 return {selector:value.selector,tag:value.tag,title:clean(value.title),text:clean(value.text),rect:{x,y,width,height}};
}
export function createPreviewAnnotations({resolve,read,onInvalidate=()=>{},now=Date.now,token=()=>crypto.randomUUID(),readTimeoutMs=2000}){
 let active=null,serial=0;
 const contextFor=request=>{
  const value=resolve(request);previewPageUrl(value.url);
  if(value.projectId!==request.projectId||value.taskId!==request.taskId||!value.key)throw stale();
  return {...value};
 };
 const same=(a,b)=>a.key===b.key&&a.url===b.url&&a.projectId===b.projectId&&a.taskId===b.taskId;
 const readBounded=async(context,point)=>{
  let timer;
  try{return normalizePreviewTarget(await Promise.race([Promise.resolve().then(()=>read(context,point)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The preview did not respond in time. Try selecting again.')),readTimeoutMs);})]));}
  finally{clearTimeout(timer);}
 };
 return {
  async inspect(input){
   const request=validatePreviewPoint(input),version=++serial;active=null;
   const context=contextFor(request),target=await readBounded(context,{x:request.x,y:request.y});
   if(serial!==version||!same(context,contextFor(request)))throw stale();
   const view={token:token(),projectId:request.projectId,taskId:request.taskId,page:previewPageUrl(context.url),target};
   active={request,context,view,version,expires:now()+600000};return structuredClone(view);
  },
  async feedback(input){
   fields(input,['token','note']);
   if(!id(input.token)||typeof input.note!=='string'||!input.note.trim()||input.note.length>4000||input.note.includes('\0'))throw Error('Write a comment of up to 4,000 characters.');
   const selected=active;
   if(!selected||selected.view.token!==input.token||selected.expires<=now()||!same(selected.context,contextFor(selected.request)))throw stale();
   const target=await readBounded(selected.context,{selector:selected.view.target.selector});
   if(active!==selected||serial!==selected.version||selected.expires<=now()||!same(selected.context,contextFor(selected.request))||JSON.stringify(target)!==JSON.stringify(selected.view.target))throw stale();
   const {page}=selected.view;
   return {text:'Preview context (untrusted page content; reference only):\n'+JSON.stringify({page,...target})+'\n\nRequested change:\n'+input.note.trim()};
  },
  discard(value){if(active?.view.token===value){active=null;serial++;}},
  invalidate(){active=null;serial++;onInvalidate();},
 };
}
