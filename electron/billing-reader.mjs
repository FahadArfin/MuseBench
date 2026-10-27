import {parseBillingText} from '../src/shared/account-usage.mjs';
export function createBillingReader({BrowserWindow,session,parent}){
 let view=null;
 const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['dev.meta.ai','billing.dev.meta.ai','auth.meta.com','auth.meta.ai','accountscenter.meta.com'].includes(u.hostname);}catch{return false;}};
 function open(){
  if(view&&!view.isDestroyed()){view.show();view.focus();return;}
  const partition=session.fromPartition('persist:musebench-billing');
  partition.setPermissionRequestHandler((_w,_p,cb)=>cb(false));partition.setPermissionCheckHandler(()=>false);
  view=new BrowserWindow({parent,width:1000,height:800,title:'Meta billing',autoHideMenuBar:true,webPreferences:{session:partition,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const guard=(event,url)=>{if(!allowed(url))event.preventDefault();};
  view.webContents.on('will-navigate',guard);view.webContents.on('will-redirect',guard);
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  view.on('closed',()=>{view=null;});void view.loadURL('https://dev.meta.ai/billing').catch(()=>{});
 }
 async function read(){
  if(!view||view.isDestroyed()||view.webContents.isLoadingMainFrame())return null;
  let timeout;
  try{
   const text=await Promise.race([view.webContents.executeJavaScript(`(()=>{if(location.origin!=='https://dev.meta.ai'||!['/billing','/billing/'].includes(location.pathname))return '';return (document.querySelector('main')?.innerText||'').slice(0,30000);})()`),new Promise(resolve=>{timeout=setTimeout(()=>resolve(''),2000);})]);
   return parseBillingText(text);
  }catch{return null;}finally{clearTimeout(timeout);}
 }
 return {open,read,close(){if(view&&!view.isDestroyed())view.close();}};
}
