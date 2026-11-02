import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {createDesktopHelper} from '../electron/desktop-helper.mjs';
import {verifySessionDenial} from './desktop-session-denial.mjs';

if(process.platform!=='win32')throw Error('Native desktop smoke requires an active Windows desktop.');
await import('./build-windows-desktop.mjs');
const dir=mkdtempSync(path.join(tmpdir(),'muse-desktop-fixture-')),exe=path.join(dir,'Fixture.exe');
execFileSync(path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe',`/out:${exe}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',path.resolve('native/desktop-test-fixture.cs')],{windowsHide:true});
const helper=createDesktopHelper({helperPath:path.resolve('native/bin/MuseBenchDesktop.exe'),timeoutMs:10000});
const readonly=process.argv.includes('--read-only');
const manualFocus=process.argv.includes('--manual-focus');
const children=[];
async function fixture(){
 const child=spawn(exe,[],{windowsHide:false,stdio:['pipe','pipe','pipe']});children.push(child);child.output='';child.stdout.on('data',chunk=>child.output+=chunk.toString());
 for(let i=0;i<100&&!child.output.includes('ready');i++)await wait(50);
 assert.match(child.output,/ready/,'isolated native fixture opens');return child;
}
const check=async input=>{const result=await helper.call(input);assert.equal(result.ok,true,JSON.stringify(result));return result;};
async function run(){
 const probe=await helper.call({op:'apps'});
 if(readonly&&process.env.GITHUB_ACTIONS==='true'&&probe.ok===false&&probe.error?.code==='session_unavailable'){
  const report=await verifySessionDenial(input=>helper.call(input));
  mkdirSync('artifacts/desktop-native',{recursive:true});writeFileSync('artifacts/desktop-native/report.json',JSON.stringify(report,null,2));
  console.log('Desktop native session-denial smoke passed: hosted runner cannot use desktop operations; all ten operations refused before input. UIA, PNG and input success are not covered in this environment.');return;
 }
 assert.equal(probe.ok,true,JSON.stringify(probe));
 const child=await fixture();
 const inventory=await check({op:'apps'});const app=inventory.apps.find(app=>app.executable.toLowerCase()===exe.toLowerCase());assert.ok(app,'running fixture executable listed: '+JSON.stringify(await helper.call({op:'windows',executable:exe})));assert.ok(!('title' in app));
 const listing=await check({op:'windows',executable:exe});const window=listing.windows.find(window=>window.pid===child.pid);assert.ok(window);
 if(!readonly&&manualFocus){console.log('WAITING FOR USER: Click and release inside the Muse Desktop Assist isolated fixture window. Input checks start automatically; no terminal reply is needed.');await new Promise((resolve,reject)=>{const ready=()=>{if(child.output.includes('fixture-clicked')){clearTimeout(timeout);child.stdout.removeListener('data',ready);resolve();}};const timeout=setTimeout(()=>{child.stdout.removeListener('data',ready);reject(Error('Manual focus verification timed out; no input was sent.'));},180000);child.stdout.on('data',ready);ready();});await wait(400);}
 if(!readonly&&!manualFocus)await check({op:'open',app,window});
 const observed=await check({op:'inspect',window});const edit=observed.elements.find(e=>e.name==='Fixture text'),password=observed.elements.find(e=>e.protected&&e.role==='Edit'),button=observed.elements.find(e=>e.name==='Fixture button'),drag=observed.elements.find(e=>e.name==='Fixture drag area');
 assert.ok(edit&&password&&button,'UIA exposes fixture controls');assert.equal(password.protected,true);assert.ok(!observed.elements.some(e=>'value' in e),'input values withheld');
 const capture=await check({op:'capture',window});assert.ok(capture.width>0&&capture.height>0);assert.equal(Buffer.from(capture.data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 for(const change of [{handle:'1'},{startedAt:'stale'},{pid:process.pid},{executable:process.execPath}]){const result=await helper.call({op:'click',window:{...window,...change},runtimeId:button.runtimeId});assert.equal(result.ok,false);assert.equal(result.error.code,'stale_window');}
 const protectedResult=await helper.call({op:'click',window,runtimeId:password.runtimeId});assert.equal(protectedResult.ok,false);assert.equal(protectedResult.error.code,'protected_control');
 const foreign=await helper.call({op:'click',window,runtimeId:'rid:foreign'});assert.equal(foreign.ok,false);assert.equal(foreign.error.code,'stale_element');
 if(!readonly){
 await check({op:'click',window,runtimeId:button.runtimeId});await wait(100);assert.match(child.output,/clicked/);
 await check({op:'click',window,runtimeId:edit.runtimeId});await check({op:'type',window,runtimeId:edit.runtimeId,text:'Muse Ω'});await wait(100);assert.match(child.output,/text:Muse Ω/);
 child.stdin.write('overlay\n');for(let i=0;i<50&&!child.output.includes('overlay-ready');i++)await wait(20);assert.match(child.output,/overlay-ready/);
 const covered=await helper.call({op:'click',window,runtimeId:button.runtimeId});assert.equal(covered.ok,false);assert.equal(covered.error.code,'stale_element');assert.ok(!child.output.includes('overlay-clicked'));child.stdin.write('clear-overlay\n');await wait(80);
 const unsafeKey=await helper.call({op:'key',window,runtimeId:edit.runtimeId,key:'Escape',modifiers:['Ctrl','Shift']});assert.equal(unsafeKey.ok,false);assert.equal(unsafeKey.error.code,'invalid_request');
 const outside=await helper.call({op:'click',window,point:{x:1.1,y:0.5}});assert.equal(outside.ok,false);assert.equal(outside.error.code,'invalid_request');
 const wrongFocus=await helper.call({op:'type',window,runtimeId:button.runtimeId,text:'rejected'});assert.equal(wrongFocus.ok,false);assert.equal(wrongFocus.error.code,'focus_changed');
 assert.ok(drag);await check({op:'drag',window,runtimeId:drag.runtimeId,endPoint:{x:(drag.rect.x+drag.rect.width/2+30-window.rect.x)/(window.rect.width-1),y:(drag.rect.y+drag.rect.height/2+30-window.rect.y)/(window.rect.height-1)}});await wait(100);assert.match(child.output,/dragged/);
 await check({op:'scroll',window,runtimeId:edit.runtimeId,delta:{x:0,y:1}});
 const other=await fixture();other.stdin.write('move\n');await wait(100);
 const secondListing=await check({op:'windows',executable:exe});const second=secondListing.windows.find(w=>w.pid===other.pid);assert.ok(second);await check({op:'open',app,window:second});
 const focus=await helper.call({op:'click',window,runtimeId:button.runtimeId});assert.equal(focus.ok,false);assert.equal(focus.error.code,'focus_changed');
 }
 const blocked=await helper.call({op:'windows',executable:process.execPath});assert.equal(blocked.ok,false);
 console.log(readonly?'Desktop native read-only smoke passed: isolated UIA, target PNG, stale identity, protected control, foreign runtime ID and host rejection. Input/focus/drag were not run.':'Desktop native smoke passed: isolated UIA, target PNG, click, Unicode text, drag, scroll dispatch, stale identity, protected control, foreign runtime ID, focus loss and host rejection.');
 mkdirSync('artifacts/desktop-native',{recursive:true});writeFileSync('artifacts/desktop-native/report.json',JSON.stringify({status:'passed',mode:readonly?'read-only':'input',desktopFunctionalCoverage:true,inputTested:!readonly,checks:['UIA','PNG','stale identity','protected control','foreign element','blocked host']},null,2));
}
try{await run();}finally{
 await helper.close();for(const child of children){child.stdin.write('close\n');await Promise.race([new Promise(r=>child.once('close',r)),wait(1500)]);if(child.exitCode===null)child.kill();}rmSync(dir,{recursive:true,force:true});
}
