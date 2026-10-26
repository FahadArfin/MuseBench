import {_electron as electron} from 'playwright';
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR'])delete env[key];
const app=await electron.launch({args:['.'],env});
async function inspect(code){return app.evaluate(async({BrowserWindow},code)=>{const window=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()),view=window.contentView.children.find(v=>v.webContents&&v.getVisible());if(!view||!['https://meta.ai','https://www.meta.ai'].includes(new URL(view.webContents.getURL()||'about:blank').origin))return null;return view.webContents.executeJavaScript(code);},code);}
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();const nav=page.getByRole('navigation',{name:'Meta AI navigation',exact:true});await nav.getByRole('button',{name:'Search',exact:true}).click();
 for(let i=0;i<80;i++){if(await inspect(`!!document.querySelector('[role="dialog"] input')`))break;await page.waitForTimeout(150);}
 await nav.getByRole('button',{name:'Media',exact:true}).click();await page.waitForTimeout(500);
 console.log('afterMedia',await inspect(`({path:location.pathname,searchOpen:!!document.querySelector('[role="dialog"] input')})`));
 await inspect(`document.querySelector('[role="dialog"] input[placeholder="Search chats"]')?.closest('[role="dialog"]')?.querySelector('button[aria-label="Close"]')?.click()`);
 await page.waitForTimeout(350);console.log('afterClose',await inspect(`!!document.querySelector('[role="dialog"] input[placeholder="Search chats"]')`));
 await nav.getByRole('button',{name:'Search',exact:true}).click();await page.waitForTimeout(500);
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()),v=w.contentView.children.find(v=>v.webContents&&v.getVisible());v.webContents.sendInputEvent({type:'mouseDown',x:8,y:8,button:'left',clickCount:1});v.webContents.sendInputEvent({type:'mouseUp',x:8,y:8,button:'left',clickCount:1});});
 await page.waitForTimeout(350);console.log('afterOutside',await inspect(`!!document.querySelector('[role="dialog"] input[placeholder="Search chats"]')`));
}finally{await app.close();}
