import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
const load=()=>import('../electron/discovery-oauth-callback.mjs');
test('callback rejects strangers, issuer mismatch, duplicates and replay without consuming active state',async t=>{
 const {createDiscoveryOAuthCallback}=await load();const codes=[],denied=[];let current=true,time=1000;
 const listener=await createDiscoveryOAuthCallback({now:()=>time,isCurrent:()=>current,onCode:v=>codes.push(v),onDenied:v=>denied.push(v)});t.after(()=>listener.close());
 assert.equal((await fetch(listener.uri)).status,409);
 const state='s'.repeat(43);listener.arm({attemptId:'attempt-fixture',state,issuer:'https://issuer.test',issRequired:true,expiresAt:2000});
 for(const query of ['state=wrong&code=x','state='+state+'&code=x','state='+state+'&code=x&code=y','state='+state+'&code=x&iss=https://evil.test','state='+state+'&code=x&unknown=y','state='+state+'&code=x&error=denied'])assert.equal((await fetch(listener.uri+'?'+query)).status,400);
 assert.equal((await fetch(listener.uri+'?'+ 'x'.repeat(17000))).status,400);assert.equal((await fetch(listener.uri,{headers:{'x-fixture-large':'x'.repeat(17000)}})).status,400);
 assert.equal(codes.length,0);assert.equal(denied.length,0);
 const response=await fetch(listener.uri+'?'+new URLSearchParams({state,code:'private-code',iss:'https://issuer.test'}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!((await response.text()).includes('private-code')));assert.equal(codes.length,1);
 assert.equal((await fetch(listener.uri+'?'+new URLSearchParams({state,code:'again',iss:'https://issuer.test'}))).status,409);
});
test('callback rejects empty code, bounds values and consumes reviewed denial only',async t=>{
 const {createDiscoveryOAuthCallback}=await load();let codes=0,denials=0;const l=await createDiscoveryOAuthCallback({isCurrent:()=>true,onCode:()=>codes++,onDenied:()=>denials++});t.after(()=>l.close());const state='s'.repeat(43);l.arm({attemptId:'attempt-fixture',state,issuer:'https://issuer.test',issRequired:false,expiresAt:Date.now()+10000});
 assert.equal((await fetch(l.uri+'?state='+state+'&code=')).status,400);assert.equal((await fetch(l.uri+'?state='+state+'&code='+'x'.repeat(8193))).status,400);
 assert.equal((await fetch(l.uri+'?state=wrong&error=access_denied&error_description=PRIVATE_PROVIDER_ERROR')).status,400);assert.equal(denials,0);
 assert.equal((await fetch(l.uri+'?state='+state+'&error=access_denied&error_description=PRIVATE_PROVIDER_ERROR')).status,200);assert.equal(denials,1);assert.equal(codes,0);
});
test('callback binds exact Host path GET, current authority and monotonic deadline',async t=>{
 const {createDiscoveryOAuthCallback}=await load();let time=1,current=true,count=0;
 const l=await createDiscoveryOAuthCallback({now:()=>time,isCurrent:()=>current,onCode:()=>count++,onDenied:()=>count++});t.after(()=>l.close());l.arm({attemptId:'attempt-fixture',state:'s'.repeat(43),issuer:'https://issuer.test',issRequired:false,expiresAt:100});
 const url=new URL(l.uri);const request=(path,headers={},method='GET')=>new Promise(resolve=>{const req=http.request({hostname:'127.0.0.1',port:url.port,path,headers,method},res=>{res.resume();resolve(res.statusCode);});req.end();});
 assert.equal(await request(url.pathname,{host:'evil.test'}),400);assert.equal(await request('/wrong'),404);assert.equal(await request(url.pathname,{},'POST'),405);
 current=false;assert.equal((await fetch(l.uri+'?state='+'s'.repeat(43)+'&code=c')).status,409);current=true;time=101;assert.equal((await fetch(l.uri+'?state='+'s'.repeat(43)+'&code=c')).status,409);time=1;assert.equal((await fetch(l.uri+'?state='+'s'.repeat(43)+'&code=c')).status,409);assert.equal(count,0);
});
