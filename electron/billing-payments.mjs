import {BILLING_DESTINATIONS} from '../src/shared/billing-plans.mjs';
const allowed=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['dev.meta.ai','billing.dev.meta.ai','accountscenter.meta.com','auth.meta.com','auth.meta.ai','www.facebook.com'].includes(u.hostname);}catch{return false;}};
// Meta owns checkout. No preload, DOM reads, injected scripts or payment credentials.
export function createBillingPayments({BrowserWindow,session,shell,parent,onClosed=()=>{}}){
 const windows=new Map();
 async function open({destination,external=false}={}){
  if(!Object.hasOwn(BILLING_DESTINATIONS,destination)||typeof external!=='boolean')throw Error('Unsupported payment destination.');
  const url=BILLING_DESTINATIONS[destination];
  if(external){await shell.openExternal(url);return{opened:true,external:true};}
  const existing=windows.get(destination);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return{opened:true};}
  const partition=session.fromPartition('persist:musebench-billing');
  partition.setPermissionRequestHandler((_w,_p,cb)=>cb(false));partition.setPermissionCheckHandler(()=>false);
  const view=new BrowserWindow({parent,width:1080,height:850,title:destination==='subscriptions'?'Meta · Muse Code subscriptions':'Meta · Billing',autoHideMenuBar:true,webPreferences:{session:partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false}});
  windows.set(destination,view);
  const guard=(event,target)=>{if(!allowed(target))event.preventDefault();};
  view.webContents.on('will-navigate',guard);view.webContents.on('will-redirect',guard);
  view.webContents.on('did-navigate',(_event,target)=>{if(allowed(target))view.setTitle(`Meta checkout · ${new URL(target).hostname}`);});
  view.webContents.setWindowOpenHandler(({url:target})=>{if(allowed(target))void view.loadURL(target).catch(()=>{});return{action:'deny'};});
  view.on('closed',()=>{windows.delete(destination);onClosed();});
  try{await view.loadURL(url);}catch{view.close();throw Error('Meta checkout could not open. Use Open in browser to continue.');}
  return{opened:true};
 }
 return{open,close(){for(const view of [...windows.values()])if(!view.isDestroyed())view.close();windows.clear();}};
}
