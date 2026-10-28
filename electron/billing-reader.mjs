import {parseBillingText} from '../src/shared/account-usage.mjs';
export const billingTextScript=`(${function(){
 const embedded=location.origin==='https://billing.dev.meta.ai'&&location.pathname==='/payment_settings/';
 const top=location.origin==='https://dev.meta.ai'&&['/billing','/billing/'].includes(location.pathname);
 if(!embedded&&!top)return '';
 const lines=((embedded?document.body:document.querySelector('main'))?.innerText||'').slice(0,30000).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const labels=/^(Current balance|Free credits in use|Your balance reaches|Month-to-date spend|Spend this month|Total spend this month|Monthly spend limit alert|Monthly spend alert)$/i;
 return lines.flatMap((s,i)=>labels.test(s)?[s,lines[i+1]??'']:['Set a monthly amount to get email alerts as you approach it.','Set up'].includes(s)?[s]:[]).join('\n');
}.toString()})()`;
export function createBillingReader({BrowserWindow,session,parent}){
 let view=null,shuttingDown=false,refreshTimer;
 const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['dev.meta.ai','billing.dev.meta.ai','auth.meta.com','auth.meta.ai','accountscenter.meta.com'].includes(u.hostname);}catch{return false;}};
 function open(){
  if(view&&!view.isDestroyed()){view.show();view.focus();return;}
  const partition=session.fromPartition('persist:musebench-billing');
  partition.setPermissionRequestHandler((_w,_p,cb)=>cb(false));partition.setPermissionCheckHandler(()=>false);
  view=new BrowserWindow({parent,width:1000,height:800,title:'Meta billing',autoHideMenuBar:true,webPreferences:{session:partition,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const guard=(event,url)=>{if(!allowed(url))event.preventDefault();};
  view.webContents.on('will-navigate',guard);view.webContents.on('will-redirect',guard);
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  view.on('close',event=>{if(!shuttingDown){event.preventDefault();view.hide();}});
  refreshTimer=setInterval(()=>{if(view&&!view.isDestroyed()&&!view.webContents.isLoadingMainFrame())view.webContents.reload();},300000);refreshTimer.unref?.();
  view.on('closed',()=>{clearInterval(refreshTimer);view=null;});void view.loadURL('https://dev.meta.ai/billing').catch(()=>{});
 }
 async function read(){
  if(!view||view.isDestroyed()||view.webContents.isLoadingMainFrame())return null;
  let timeout;
  try{
   const contents=view.webContents;
   const topUrl=contents.getURL?.();
   if(topUrl){const u=new URL(topUrl);if(u.origin!=='https://dev.meta.ai'||!['/billing','/billing/'].includes(u.pathname))return null;}
   const team=topUrl?new URL(topUrl).searchParams.get('team_id'):null;
   const frames=(contents.mainFrame?.framesInSubtree??[]).filter(frame=>{try{const u=new URL(frame.url);return u.origin==='https://billing.dev.meta.ai'&&u.pathname==='/payment_settings/'&&(!team||u.searchParams.get('team_id')===team);}catch{return false;}});
   if(frames.length>1)return null;
   const target=frames[0]??contents;
   const text=await Promise.race([target.executeJavaScript(billingTextScript),new Promise(resolve=>{timeout=setTimeout(()=>resolve(''),2000);})]);
   if(topUrl&&contents.getURL()!==topUrl)return null;
   const billing=parseBillingText(text);return billing?{...billing,accountId:team??null}:null;
  }catch{return null;}finally{clearTimeout(timeout);}
 }
 return {open,read,close(){shuttingDown=true;if(view&&!view.isDestroyed())view.close();}};
}
