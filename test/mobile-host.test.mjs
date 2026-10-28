import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {randomUUID} from 'node:crypto';
import {createMobileHost} from '../electron/mobile-host.mjs';
const protection={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('protected:'+value),decryptString:bytes=>bytes.toString().slice(10)};
async function fixture(t){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-mobile-'));let time=Date.now(),calls=0;
 const service={snapshot:()=>({chats:[{id:'chat-one',title:'My project'}]}),readChat:()=>({messages:[]}),command:async()=>{calls++;return{ok:true};}};
 const host=await createMobileHost({dataDir,protection,service,now:()=>time});t.after(async()=>{await host.close();await rm(dataDir,{recursive:true,force:true});});
 assert.equal((await host.command({type:'status'})).running,false);await host.command({type:'start'});
 const pair=await host.command({type:'pair',address:'127.0.0.1'}),payload=JSON.parse(Buffer.from(new URL(pair.pairing.link).searchParams.get('data'),'base64url'));
 const stored=JSON.parse(protection.decryptString(await readFile(path.join(dataDir,'mobile-devices.bin'))));
 const request=(route,{token=payload.secret,body,origin}={})=>new Promise((resolve,reject)=>{
  const req=https.request(payload.url+route,{ca:stored.cert,servername:'localhost',method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
 return{host,request,payload,dataDir,service,advance:ms=>time+=ms,calls:()=>calls,issuedAt:()=>time};
}
test('TLS pairing is one-time, authenticated, and revocable; browser origins are refused',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/v1/state',{token:'wrong'})).status,401);
 assert.equal((await f.request('/v1/pair',{body:{name:'Tablet'},origin:'https://example.com'})).status,403);
 const paired=await f.request('/v1/pair',{body:{name:'Tablet'}});assert.equal(paired.status,200);const token=paired.body.token;
 assert.equal((await f.request('/v1/pair',{body:{name:'Other'}})).status,401);
 assert.equal((await f.request('/v1/state',{token})).body.chats[0].title,'My project');
 const status=await f.host.command({type:'status'});assert.equal(status.devices.length,1);assert.ok(!JSON.stringify(status).includes(token));
 await f.host.command({type:'revoke',id:status.devices[0].id});assert.equal((await f.request('/v1/state',{token})).status,401);
});
test('expired pairing and unauthenticated commands never reach desktop actions',async t=>{
 const f=await fixture(t);f.advance(600001);assert.equal((await f.request('/v1/pair',{body:{name:'Tablet'}})).status,401);
 assert.equal((await f.request('/v1/command',{body:{kind:'send',taskId:'chat-one',text:'hello'}})).status,401);assert.equal(f.calls(),0);
});
test('retrying a command executes once and conflicting reuse or stale commands fail',async t=>{
 const f=await fixture(t),token=(await f.request('/v1/pair',{body:{name:'Tablet'}})).body.token;
 const body={kind:'send',taskId:'chat-one',text:'Hello',requestId:randomUUID(),issuedAt:f.issuedAt()};
 assert.equal((await f.request('/v1/command',{token,body})).status,202);
 assert.equal((await f.request('/v1/command',{token,body})).status,202);
 assert.equal((await f.request('/v1/command',{token,body:{...body,text:'Changed'}})).status,409);
 assert.equal((await f.request('/v1/command',{token,body:{...body,requestId:randomUUID(),issuedAt:body.issuedAt-700000}})).status,400);
 assert.equal((await f.request('/v1/command',{token,body:{...body,requestId:randomUUID(),kind:'shell',text:'rm'}})).status,400);
 const state=(await f.request('/v1/state',{token})).body;assert.equal(state.receipts[0].status,'completed');assert.equal(f.calls(),1);
});

test('restart preserves pairing and reports an interrupted receipt as unknown without replaying it',async t=>{
 const f=await fixture(t),token=(await f.request('/v1/pair',{body:{name:'Tablet'}})).body.token;
 const body={kind:'send',taskId:'chat-one',text:'Do once',requestId:randomUUID(),issuedAt:f.issuedAt()};
 await f.request('/v1/command',{token,body});await f.host.close();
 const file=path.join(f.dataDir,'mobile-devices.bin'),stored=JSON.parse(protection.decryptString(await readFile(file)));
 stored.receipts[0].status='pending';await writeFile(file,protection.encryptString(JSON.stringify(stored)));
 let calls=0;const restarted=await createMobileHost({dataDir:f.dataDir,protection,service:{snapshot:()=>({chats:[]}),command:async()=>calls++}});t.after(()=>restarted.close());
 assert.equal((await restarted.command({type:'status'})).running,false);
 await restarted.command({type:'start'});
 const state=await f.request('/v1/state',{token});assert.equal(state.body.receipts[0].status,'unknown');
 const retry=await f.request('/v1/command',{token,body});assert.equal(retry.body.status,'unknown');assert.equal(calls,0);
});

test('an unavailable keyring cannot enable the companion listener',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-no-keyring-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const host=await createMobileHost({dataDir,protection:{isEncryptionAvailable:()=>false},service:{}});t.after(()=>host.close());
 await assert.rejects(host.command({type:'start'}),/keyring/);assert.equal((await host.command({type:'status'})).running,false);
});

test('uncertain admitted sends stay unknown and are never represented as safely rejected',async t=>{
 const f=await fixture(t),token=(await f.request('/v1/pair',{body:{name:'Tablet'}})).body.token;
 f.service.command=async()=>{throw Object.assign(Error('Check the desktop before retrying.'),{outcome:'unknown'});};
 const body={kind:'send',taskId:'chat-one',text:'Uncertain turn',requestId:randomUUID(),issuedAt:f.issuedAt()};
 await f.request('/v1/command',{token,body});
 const receipt=(await f.request('/v1/state',{token})).body.receipts[0];assert.equal(receipt.status,'unknown');
});
