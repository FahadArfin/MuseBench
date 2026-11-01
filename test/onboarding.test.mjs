import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {createOnboarding} from '../electron/onboarding.mjs';
function fixture(settings={}){let child,input,args,options,spawns=0,kills=0;const runtime={};const service=createOnboarding({...settings,getBinary:()=>path.resolve('muse.exe'),getRuntime:()=>runtime,personal:{checkLogin:async()=>({status:'required'}),openLogin:async()=>{}},spawnProcess:(_binary,a,o)=>{args=a;options=o;spawns++;child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=value=>{input=value;};child.kill=()=>{kills++;child.killed=true;return settings.kill?settings.kill():true;};return child;}});return {service,runtime,get child(){return child;},get input(){return input;},get args(){return args;},get options(){return options;},get spawns(){return spawns;},get kills(){return kills;}};}
test('Code stays gated until the native sign-in process succeeds',async()=>{const f=fixture();assert.equal((await f.service.command({type:'status'})).code.status,'required');assert.equal((await f.service.command({type:'loginCode'})).code.status,'pending');assert.deepEqual(f.args,['login']);assert.equal(f.options.shell,false);f.child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.status,'ready');f.service.close();});
test('failed and cancelled sign-ins cannot unlock Code',async()=>{const f=fixture();await f.service.command({type:'loginCode'});f.child.emit('error',Error('private provider details'));f.child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.status,'required');await f.service.command({type:'loginCode'});const child=f.child;await f.service.command({type:'cancel'});child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.status,'required');f.service.close();});
test('API secrets are sent only over stdin and absent from returned state',async()=>{const f=fixture(),key='secret-example-123456';const state=await f.service.command({type:'apiKey',key});assert.deepEqual(f.args,['auth','set','--api-key-stdin']);assert.equal(f.input,key+'\n');f.child.stdout.emit('data',Buffer.from(key));f.child.stderr.emit('data',Buffer.from(key));assert.ok(!JSON.stringify(state).includes(key));f.child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.method,'api');f.service.close();});
test('only official device login links are exposed',async()=>{const f=fixture();await f.service.command({type:'loginCode'});f.child.stdout.emit('data',Buffer.from('https://evil.example/login secret-value\ncode: ABCD-1234\nhttps://auth.meta.com/device'));const {code}=await f.service.command({type:'status'});assert.equal(code.loginUrl,'https://auth.meta.com/device');assert.equal(code.userCode,'ABCD-1234');assert.ok(!JSON.stringify(code).includes('secret-value'));f.child.emit('close',1);await f.service.close();});
test('runtime auth rejection gates again without making reauthentication impossible',async()=>{const f=fixture();await f.service.command({type:'loginCode'});f.child.emit('close',0);f.runtime.failureCode='auth';assert.equal((await f.service.command({type:'status'})).code.status,'required');await f.service.command({type:'loginCode'});f.child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.status,'ready');f.service.close();});

for(const [name,kill] of [['refused',()=>false],['failed',()=>{throw Error('private kill failure');}]])test(`a ${name} sign-in cancellation retains ownership until close`,async t=>{
 const f=fixture({kill,cleanupTimeoutMs:10});t.after(async()=>{f.child?.emit('close',1);await f.service.close();});
 await f.service.command({type:'loginCode'});const first=f.child;
 const cancelled=await f.service.command({type:'cancel'});assert.equal(cancelled.code.status,'pending');assert.equal(f.service.isBusy(),true);
 await assert.rejects(f.service.command({type:'loginCode'}),/sign-in|shutdown/i);assert.equal(f.spawns,1);
 await new Promise(resolve=>setTimeout(resolve,25));
 const waiting=await f.service.command({type:'status'});assert.equal(waiting.code.status,'pending');assert.equal(waiting.code.cleanup,'unconfirmed');assert.ok(!JSON.stringify(waiting).includes('private'));
 f.runtime.failureCode='auth';assert.equal((await f.service.command({type:'status'})).code.status,'pending');
 first.stdout.emit('data',Buffer.from('https://auth.meta.com/stale code: STAL-E123'));assert.equal((await f.service.command({type:'status'})).code.loginUrl,undefined);
 first.emit('close',0);assert.equal(f.service.isBusy(),false);assert.equal((await f.service.command({type:'status'})).code.status,'required');
 await f.service.command({type:'loginCode'});assert.equal(f.spawns,2);f.child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.status,'ready');
});

test('a sign-in timeout waits for close and cannot unlock a late success',async t=>{
 const f=fixture({signInTimeoutMs:10,cleanupTimeoutMs:10});t.after(async()=>{f.child?.emit('close',1);await f.service.close();});
 await f.service.command({type:'loginCode'});
 for(let attempt=0;attempt<100&&(await f.service.command({type:'status'})).code.cleanup!=='unconfirmed';attempt++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(f.kills,1);assert.equal(f.service.isBusy(),true);assert.equal((await f.service.command({type:'status'})).code.cleanup,'unconfirmed');
 await assert.rejects(f.service.command({type:'loginCode'}),/sign-in|shutdown/i);assert.equal(f.spawns,1);
 f.child.emit('close',0);assert.equal(f.service.isBusy(),false);assert.equal((await f.service.command({type:'status'})).code.status,'required');
});

test('a process error cannot release a sign-in before its close event',async t=>{
 const f=fixture({cleanupTimeoutMs:10});t.after(async()=>{f.child?.emit('close',1);await f.service.close();});
 await f.service.command({type:'loginCode'});f.child.emit('error',Error('private process failure'));
 assert.equal(f.service.isBusy(),true);await assert.rejects(f.service.command({type:'loginCode'}),/sign-in|shutdown/i);assert.equal(f.spawns,1);
 f.child.emit('close',0);assert.equal((await f.service.command({type:'status'})).code.status,'required');assert.equal(f.service.isBusy(),false);
});

test('shutdown is bounded but keeps the sign-in blocker until confirmed close',async t=>{
 const f=fixture({cleanupTimeoutMs:10});t.after(async()=>{f.child?.emit('close',1);await f.service.close();});
 await f.service.command({type:'loginCode'});const closing=Promise.resolve(f.service.close());closing.catch(()=>{});
 assert.equal(f.service.isBusy(),true);await assert.rejects(closing,error=>error.code==='SIGNIN_CLEANUP'&&!error.message.includes('private'));
 assert.equal(f.service.isBusy(),true);await assert.rejects(f.service.command({type:'loginCode'}),/sign-in|shutdown|closed/i);
 f.child.emit('close',0);await f.service.close();assert.equal(f.service.isBusy(),false);assert.equal((await f.service.command({type:'status'})).code.status,'required');
});

test('shutdown waits for a delayed sign-in close instead of treating kill as exit',async()=>{
 const f=fixture({cleanupTimeoutMs:100});await f.service.command({type:'loginCode'});let finished=false;
 const closing=Promise.resolve(f.service.close()).then(()=>{finished=true;});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(finished,false);assert.equal(f.service.isBusy(),true);f.child.emit('close',0);await closing;assert.equal(f.service.isBusy(),false);
});
