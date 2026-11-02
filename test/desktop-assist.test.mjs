import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createDesktopAssist} from '../electron/desktop-assist.mjs';
import {validateDesktopInput} from '../src/shared/desktop-assist.mjs';

async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'muse-desktop-policy-'));t.after(()=>rm(dir,{recursive:true,force:true}));const exe=path.join(dir,'Fixture.exe');await writeFile(exe,'fixture-binary');
 let state={task:{id:'chat',mode:'muse'},activeProject:{root:dir},runtime:{status:'running',permissionVerified:true}},current=true;const calls=[],events=[];
 const window={handle:'15',pid:700,startedAt:'1000',executable:exe,appName:'Fixture',title:'Fixture document',rect:{x:0,y:0,width:600,height:400},elevated:false};
 const helper={available:true,async call(input){calls.push(input);if(input.op==='apps')return{ok:true,apps:[{id:'native-app',name:'Fixture',executable:exe}]};if(input.op==='windows')return{ok:true,windows:[window]};if(input.op==='inspect')return{ok:true,window,elements:[{runtimeId:'1,2',name:'Text',role:'Edit',rect:{x:20,y:20,width:100,height:20},enabled:true,protected:false},{runtimeId:'1,3',name:'Secret',role:'Edit',protected:true}]};return{ok:true,window};},cancel(){calls.push({op:'cancel'});},close(){}};
 const service=await createDesktopAssist({dataDir:dir,helper,getState:()=>state,onState:s=>events.push(s),platform:'win32',approvalTimeoutMs:2000});t.after(()=>service.close());
 const binding={taskId:'chat',root:dir,leaseId:'lease',isCurrent:()=>current};
 return{service,binding,calls,events,exe,dir,helper,window,setState:s=>state=s,invalidate:()=>current=false};
}
async function allow(h,operation,decision='allow'){const result=h.service.agentCommand(h.binding,operation);await new Promise(resolve=>setTimeout(resolve,20));const request=h.service.snapshot().pending;assert(request);await h.service.command({type:'decide',id:request.id,decision});return result;}
test('app content waits for user approval and stale inspected controls cannot inject input',async t=>{const h=await fixture(t),apps=await h.service.agentCommand(h.binding,{type:'apps'}),appId=apps.apps[0].id;
 const view=await allow(h,{type:'windows',appId});assert.equal(h.calls.filter(c=>c.op==='windows').length,1);const windowId=view.windows[0].id;
 const observed=await h.service.agentCommand(h.binding,{type:'inspect',windowId});assert(observed.observationId);assert.equal(observed.elements[0].name,'Text');
 await assert.rejects(h.service.agentCommand(h.binding,{type:'type',windowId,observationId:observed.observationId,ref:observed.elements[1].ref,text:'never'}),/protected/i);
 await h.service.agentCommand(h.binding,{type:'type',windowId,observationId:observed.observationId,ref:observed.elements[0].ref,text:'Hello'});
 await assert.rejects(h.service.agentCommand(h.binding,{type:'click',windowId,observationId:observed.observationId,x:.5,y:.5}),/inspect|observation/i);
 assert.equal(h.calls.filter(c=>c.op==='type').length,1);
});
test('connection loss cancels pending approval; old decisions cannot grant access',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});const waiting=h.service.agentCommand(h.binding,{type:'windows',appId:apps[0].id});await new Promise(r=>setTimeout(r,20));const id=h.service.snapshot().pending.id;h.invalidate();await h.service.command({type:'decide',id,decision:'always'});await assert.rejects(waiting,/changed|expired|revoked/i);assert.equal(h.service.snapshot().allowedApps.length,0);assert.equal(h.calls.filter(c=>c.op==='windows').length,0);});
test('Stop revokes access, blocks silent resume and preserves explicit saved app permissions',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});await allow(h,{type:'windows',appId:apps[0].id},'always');assert.equal(h.service.snapshot().allowedApps.length,1);await h.service.command({type:'stop'});await assert.rejects(h.service.agentCommand(h.binding,{type:'apps'}),/stopped/i);await h.service.command({type:'resume'});await h.service.command({type:'revoke',appId:apps[0].id});assert.equal(h.service.snapshot().allowedApps.length,0);});
test('a replaced executable does not inherit persisted app access',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});await allow(h,{type:'windows',appId:apps[0].id},'always');await writeFile(h.exe,'a different executable');await assert.rejects(h.service.agentCommand(h.binding,{type:'windows',appId:apps[0].id}),/changed|list|identity/i);assert.equal(h.calls.filter(c=>c.op==='windows').length,1);});
test('desktop schema rejects owner injection, system shortcuts and malformed points',()=>{for(const input of [{type:'apps',taskId:'other'},{type:'key',windowId:'w',observationId:'o',key:'F5',modifiers:['Alt']},{type:'click',windowId:'w',observationId:'o',x:NaN,y:0},{type:'click',windowId:'w',observationId:'o',ref:'r',x:0,y:0}])assert.throws(()=>validateDesktopInput(input));});

test('status remains readable while stopped or disabled without starting a helper',async t=>{const h=await fixture(t);await h.service.command({type:'stop'});assert.equal((await h.service.agentCommand(h.binding,{type:'status'})).stopped,true);await h.service.command({type:'set',enabled:false});assert.equal((await h.service.agentCommand(h.binding,{type:'status'})).enabled,false);assert.equal(h.calls.filter(c=>c.op!=='cancel').length,0);});

test('clipboard chords and control text cannot reach the native adapter',()=>{for(const input of [
 ...['C','V','X','Enter','Escape'].map(key=>({type:'key',windowId:'w',observationId:'o',key,modifiers:['Ctrl']})),
 {type:'key',windowId:'w',observationId:'o',key:'Escape',modifiers:['Ctrl','Shift']},
 ...['one\ntwo','\t','\x00'].map(text=>({type:'type',windowId:'w',observationId:'o',ref:'e1',text})),
])assert.throws(()=>validateDesktopInput(input));});

test('new window inventory expires old tokens instead of growing reusable handles',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});const first=await allow(h,{type:'windows',appId:apps[0].id});await h.service.agentCommand(h.binding,{type:'windows',appId:apps[0].id});await assert.rejects(h.service.agentCommand(h.binding,{type:'inspect',windowId:first.windows[0].id}),/windows again/i);});

test('owner loss during Always allow persistence removes the saved permission from disk',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});const waiting=h.service.agentCommand(h.binding,{type:'windows',appId:apps[0].id});const rejected=assert.rejects(waiting,/changed|revoked/i);await new Promise(r=>setTimeout(r,20));const id=h.service.snapshot().pending.id;
 const decision=h.service.command({type:'decide',id,decision:'always'});const failed=assert.rejects(decision,/changed|revoked/i);
 for(let i=0;i<1000&&!h.service.snapshot().allowedApps.length;i++)await new Promise(r=>setImmediate(r));
 assert.equal(h.service.snapshot().allowedApps.length,1);h.invalidate();await failed;await rejected;
 assert.equal(JSON.parse(await readFile(path.join(h.dir,'desktop-assist.json'),'utf8')).apps.length,0);
});

test('Stop then Resume during approval identity verification cannot resurrect that decision',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});const waiting=h.service.agentCommand(h.binding,{type:'windows',appId:apps[0].id});const rejected=assert.rejects(waiting,/changed|revoked/i);await new Promise(r=>setTimeout(r,20));const decision=h.service.command({type:'decide',id:h.service.snapshot().pending.id,decision:'always'});await h.service.command({type:'stop'});await h.service.command({type:'resume'});await decision;await rejected;assert.equal(h.service.snapshot().allowedApps.length,0);});

test('a changed native snapshot cannot authorize old pixels or inspected controls',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'}),view=await allow(h,{type:'windows',appId:apps[0].id}),windowId=view.windows[0].id,original=h.helper.call;
 h.helper.call=async input=>['capture','inspect'].includes(input.op)?{ok:true,window:{...h.window,rect:{...h.window.rect,width:900}},elements:[],data:'aGVsbG8=',width:600,height:400,bounds:h.window.rect}:original(input);
 for(const type of ['capture','inspect'])await assert.rejects(h.service.agentCommand(h.binding,{type,windowId}),/changed|snapshot|bounds/i);
});

test('key actions carry an inspected target and validate safe shortcuts',()=>{assert.throws(()=>validateDesktopInput({type:'key',windowId:'w',observationId:'o',key:'Enter'}));assert.doesNotThrow(()=>validateDesktopInput({type:'key',windowId:'w',observationId:'o',ref:'e1',key:'A',modifiers:['Ctrl']}));});

test('an old open paused in identity lookup cannot resume after Stop and Resume',async t=>{const h=await fixture(t),{apps}=await h.service.agentCommand(h.binding,{type:'apps'});await allow(h,{type:'windows',appId:apps[0].id},'always');const opening=h.service.agentCommand(h.binding,{type:'open',appId:apps[0].id});const rejected=assert.rejects(opening,/revoked|stopped/i);await h.service.command({type:'stop'});await h.service.command({type:'resume'});await rejected;assert.equal(h.calls.filter(c=>c.op==='open').length,0);});
