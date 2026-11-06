import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDesktopFinance} from '../electron/finance.mjs';

// Contract double only; actual OS encryption/restart is covered by finance-smoke.
const safeStorage={isEncryptionAvailable:()=>true,isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async text=>Buffer.from(text),decryptStringAsync:async bytes=>({result:bytes.toString(),shouldReEncrypt:false})};
test('desktop adapter consumes asynchronous Electron decryption result on reopen',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'finance-desktop-'));let owner;
 try{const options={dataDir:path.join(dir,'finance'),workspaceRoot:path.join(dir,'workspace'),safeStorage,dialog:{},shell:{},getWindow:()=>null};
  owner=await createDesktopFinance(options);await owner.command({type:'configure',clientId:'fixture-client',secret:'fixture-secret',environment:'sandbox'});await owner.close();
  owner=await createDesktopFinance(options);assert.equal(owner.snapshot().configured,true);assert.equal(owner.snapshot().protectedStorage,true);assert.equal(owner.snapshot().error,null);
 }finally{await owner?.close();await rm(dir,{recursive:true,force:true});}
});
test('desktop adapter requires async protection even when legacy API reports available',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'finance-protection-'));let owner;
 try{owner=await createDesktopFinance({dataDir:path.join(dir,'finance'),workspaceRoot:dir,safeStorage:{...safeStorage,isAsyncEncryptionAvailable:async()=>false},dialog:{},shell:{},getWindow:()=>null});assert.equal(owner.snapshot().protectedStorage,false);await assert.rejects(owner.command({type:'configure',clientId:'fixture-client',secret:'fixture-secret',environment:'sandbox'}),/Protected/);
 }finally{await owner?.close();await rm(dir,{recursive:true,force:true});}
});

test('unconfirmed question cleanup remains visible and blocks replacement until Stop confirms it',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'finance-cleanup-'));let owner,listener,confirmed=false;
 try{owner=await createDesktopFinance({dataDir:path.join(dir,'finance'),workspaceRoot:dir,safeStorage,dialog:{},shell:{},getWindow:()=>null,runtimeFactory:()=>({subscribe:fn=>{listener=fn;return()=>{};},connect:async()=>{},send:async()=>{listener({status:'completed',messages:[{kind:'agentMessage',text:'Fixture answer'}]});},disconnect:async()=>{},snapshot:()=>({cleanup:confirmed?'confirmed':'unconfirmed'})})});
  await assert.rejects(owner.command({type:'ask',question:'Spending?',month:'2026-11',currency:'USD'}),/cleanup is not confirmed/);
  assert.equal(owner.snapshot().questionBusy,true);assert.equal(owner.isBusy(),true);
  await assert.rejects(owner.command({type:'budget',currency:'USD',category:'Food',amountMinor:10000}),/Finish/);
  assert.equal((await owner.command({type:'stopAsk'})).state.questionBusy,true);
  confirmed=true;assert.equal((await owner.command({type:'stopAsk'})).state.questionBusy,false);assert.equal(owner.isBusy(),false);
 }finally{confirmed=true;await owner?.close();await rm(dir,{recursive:true,force:true});}
});
