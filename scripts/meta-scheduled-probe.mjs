import {_electron as electron} from 'playwright';
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR'])delete env[key];
const app=await electron.launch({args:['.'],env});
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.locator('.meta-native-navigation').getByRole('button',{name:'Scheduled',exact:true}).click();await page.waitForTimeout(1500);
 async function inspect(code){return app.evaluate(async({BrowserWindow},code)=>{const w=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()),v=w.contentView.children.find(v=>v.webContents&&v.getVisible());if(!v||new URL(v.webContents.getURL()).pathname!=='/scheduled')return null;return v.webContents.executeJavaScript(code);},code);}
 for(let i=0;i<40;i++){const state=await page.evaluate(()=>window.musebench.personalState());if(state.schedules?.status==='ready'){console.log('schedules',state.schedules);break;}await page.waitForTimeout(200);}
 console.log('native',await page.locator('.scheduled-sidebar').innerText());
 await page.locator('.scheduled-task-title').first().click();await page.waitForTimeout(400);
 console.log('editor',await inspect(`document.querySelector('[role="dialog"]')?.innerText`));
 await inspect(`document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click()`);await page.waitForTimeout(400);
 await page.locator('.scheduled-task .icon-button').first().click();await page.waitForTimeout(400);
 console.log('menu',await inspect(`[...document.querySelectorAll('[role="menuitem"]')].map(e=>e.textContent)`));
 await page.locator('.personal-sidebar').screenshot({path:'artifacts/scheduled-sidebar.png'});

}finally{await app.close();}
