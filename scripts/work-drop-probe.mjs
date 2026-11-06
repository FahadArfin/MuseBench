// Isolated actual-Electron File provenance proof. No provider or installed app/profile is used.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {_electron as electron} from 'playwright';
const root=process.cwd(),temporary=await mkdtemp(path.join(os.tmpdir(),'musebench-drop-probe-'));let app;
try{
 const entry=path.join(temporary,'fixture.cjs'),file=path.join(temporary,'local-source.txt');await writeFile(file,'Disposable disk-backed File provenance fixture.');
 await writeFile(entry,`const {app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temporary,'profile'))});globalThis.dropCalls=[];ipcMain.handle('musebench:work-import-files',(_event,value)=>{globalThis.dropCalls.push(value);return {itemId:value.itemId,acceptedFiles:value.paths.length};});app.whenReady().then(()=>{const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:${JSON.stringify(path.join(root,'electron','preload.cjs'))}}});window.loadURL('data:text/html,<!doctype html><title>Work file provenance fixture</title><input id="file" type="file">');});`);
 const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({cwd:root,args:[entry],env:environment});const page=await app.firstWindow();await page.waitForFunction(()=>typeof window.musebench?.importWorkFiles==='function');await page.locator('#file').setInputFiles(file);
 const result=await page.evaluate(async()=>window.musebench.importWorkFiles('explicit-item',[document.querySelector('#file').files[0]]));assert.deepEqual(result,{itemId:'explicit-item',acceptedFiles:1});
 assert.deepEqual(await app.evaluate(()=>globalThis.dropCalls),[{itemId:'explicit-item',paths:[file]}]);
 const rejected=await page.evaluate(async()=>{const results=[];for(const invalid of [new File(['constructed'],'fake.png'),{name:'spoof.png',path:'C:\\private.png'},'C:\\private.png']){try{await window.musebench.importWorkFiles('explicit-item',[invalid]);results.push(false);}catch{results.push(true);}}return results;});assert.deepEqual(rejected,[true,true,true]);assert.equal(await app.evaluate(()=>globalThis.dropCalls.length),1);
 console.log('PASS Electron disk-backed File crosses contextBridge to the explicit item; native path is derived only through webUtils.');
 console.log('PASS Constructed File, forged File.path and string input reject before native IPC.');
}finally{if(app)await app.close();await rm(temporary,{recursive:true,force:true,maxRetries:3});}
