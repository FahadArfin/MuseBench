import {_electron as electron} from 'playwright';
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR'])delete env[key];
const app=await electron.launch({args:['.'],env});
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.locator('.personal-navigation').locator('.muse-agent-shortcut').click();
 for(let i=0;i<60;i++){
  const result=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()),v=w.contentView.children.find(v=>v.webContents&&v.getVisible());if(!v||new URL(v.webContents.getURL()||'about:blank').origin!=='https://muse.ai')return null;return v.webContents.executeJavaScript(`(()=>{const dock=document.querySelector('[data-hatch-dock]');if(!dock)return null;return [...document.querySelectorAll('[data-hatch-avatar-interaction] img,[data-hatch-avatar-interaction] video')].map(e=>{let encoded=null,error=null;try{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(e,0,0,64,64);encoded=c.toDataURL('image/png').length;}catch(x){error=x.name;}return {tag:e.tagName,slot:e.getAttribute('data-hatch-avatar-slot'),layer:e.getAttribute('data-hatch-avatar-layer'),host:!!e.closest('[data-hatch-avatar-host]'),width:e.naturalWidth||e.videoWidth,ready:e.complete??e.readyState,encoded,error};});})()`);});
  if(result?.some(e=>e.width)){console.log(JSON.stringify(result,null,2));break;}await page.waitForTimeout(250);
 }
}finally{await app.close();}
