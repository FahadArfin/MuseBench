import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleFromFiles} from '../src/sites/files.mjs';
import {sitePreviewUrl,isSitePreviewUrl,createSitePreviewHandler} from '../electron/sites-protocol.mjs';
import * as sitesProtocol from '../electron/sites-protocol.mjs';
const id='82b2492e-799d-4ae1-b271-09ca6c5632cd';
const bundle=bundleFromFiles([{path:'index.html',data:'<script src="/app.js"></script><link rel="stylesheet" href="styles.css">'},{path:'app.js',data:'document.body.dataset.loaded="yes"'},{path:'styles.css',data:'body{color:red}'},{path:'about/index.html',data:'About'}]);
test('preview URLs isolate each site and immutable hash while retaining ordinary root asset resolution',()=>{
 const url=sitePreviewUrl(id,bundle.hash);assert.ok(isSitePreviewUrl(url));assert.equal(new URL('/app.js',url).href,`musebench-site://${id}.${bundle.hash}.preview/app.js`);
 for(const bad of [url.replace('musebench-site:','https:'),url.replace('.preview/', '.evil/'),url.replace('://','://user@'),url.replace('.preview/', '.preview:123/'),url.replace('index.html','../private.txt'),url.replace('index.html','%2e%2e/secret.txt'),url.replace('index.html','assets%2fsecret.js')])assert.equal(isSitePreviewUrl(bad),false,bad);
});

test('a Sites frame cannot navigate outside its exact site and content hash',()=>{
 const decide=sitesProtocol.sitePreviewNavigationDecision,source=sitePreviewUrl(id,bundle.hash);
 assert.equal(typeof decide,'function','Preview navigation must account for the source frame.');
 for(const target of ['http://127.0.0.1:4318/target','https://example.test/',`musebench-artifact://preview/${id}`,'file:///C:/private.txt','about:blank',sitePreviewUrl(id,'a'.repeat(64)),sitePreviewUrl('11111111-1111-4111-8111-111111111111',bundle.hash)]){
  assert.equal(decide({frameUrl:source,initiatorUrl:source,url:target}),false,target);
 }
 assert.equal(decide({frameUrl:source,initiatorUrl:source,url:new URL('/about/?view=1#section',source).href}),true);
 assert.equal(decide({frameUrl:source,initiatorUrl:null,url:source}),true);
 assert.equal(decide({frameUrl:source,initiatorUrl:null,url:'http://127.0.0.1:4318/target'}),false);
 assert.equal(decide({frameUrl:'about:blank',initiatorUrl:source,url:'http://127.0.0.1:4318/target'}),false);
});

test('host-driven initial preview loads remain separate from Sites frame navigation',()=>{
 const decide=sitesProtocol.sitePreviewNavigationDecision,source=sitePreviewUrl(id,bundle.hash);
 assert.equal(typeof decide,'function');
 assert.equal(decide({frameUrl:'about:blank',initiatorUrl:'file:///app/index.html',url:source,hostInitiated:true}),null);
 assert.equal(decide({frameUrl:source,initiatorUrl:'file:///app/index.html',url:sitePreviewUrl(id,'a'.repeat(64)),hostInitiated:true}),null);
 assert.equal(decide({frameUrl:'http://127.0.0.1:4318/',initiatorUrl:'http://127.0.0.1:4318/',url:'http://127.0.0.1:4318/about'}),null);
 assert.equal(decide({frameUrl:'musebench-site://invalid/',url:source}),false);
});
test('preview returns only exact authorized snapshot resources and denies unknown or mutation requests',async()=>{
 let reads=0;const handler=createSitePreviewHandler({getBundle:async(site,hash)=>{reads++;return site===id&&hash===bundle.hash?bundle:null;}}),url=sitePreviewUrl(id,bundle.hash);
 assert.equal((await handler({url,method:'POST'})).status,405);assert.equal(reads,0);
 assert.equal((await handler({url:'musebench-site://preview/secret',method:'GET'})).status,404);assert.equal(reads,0);
 const script=await handler({url:new URL('/app.js',url).href,method:'GET'});assert.equal(await script.text(),'document.body.dataset.loaded="yes"');assert.match(script.headers.get('content-type'),/javascript/);
 assert.equal((await handler({url:new URL('/about/',url).href,method:'GET'})).status,200);
 assert.equal((await handler({url:new URL('/missing.js',url).href,method:'GET'})).status,404);
 assert.equal((await handler({url:sitePreviewUrl(id,'a'.repeat(64)),method:'GET'})).status,404);
});
test('preview CSP preserves opaque sandbox and blocks network, frames, forms, workers and caching',async()=>{
 const handler=createSitePreviewHandler({getBundle:async()=>bundle});const response=await handler({url:sitePreviewUrl(id,bundle.hash),method:'GET'}),csp=response.headers.get('content-security-policy');
 for(const rule of ["default-src 'none'","connect-src 'none'","frame-src 'none'","form-action 'none'","worker-src 'none'",'sandbox allow-scripts'])assert.ok(csp.includes(rule),rule);
 assert.doesNotMatch(csp,/allow-same-origin|unsafe-eval|https:|http:/);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('access-control-allow-origin'),'*');
});
test('preview refuses forged snapshots and hides internal filesystem errors',async()=>{
 const forged=structuredClone(bundle);forged.files[0].data=Buffer.from('different').toString('base64');const handler=createSitePreviewHandler({getBundle:async()=>forged});assert.equal((await handler({url:sitePreviewUrl(id,bundle.hash),method:'GET'})).status,404);
 const failed=createSitePreviewHandler({getBundle:async()=>{throw Error('secret C:/private');}});const error=await failed({url:sitePreviewUrl(id,bundle.hash),method:'GET'});assert.equal(error.status,500);assert.doesNotMatch(await error.text(),/private|secret/);
});
