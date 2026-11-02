import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {createPublicWebReader,publicWebUrl,resolvePublicWebDestination,extractPublicWebText,PUBLIC_WEB_LIMITS} from '../src/runtime/public-web-reader.mjs';
const publicLookup=async()=>[{address:'93.184.216.34',family:4}];
function transport(pages){
 const calls=[];
 const request=(url,options,callback)=>{
  const req=new EventEmitter();let response,aborted=false;
  req.destroy=()=>{response?.destroy();};
  const abort=()=>{aborted=true;response?.destroy();req.emit('error',Object.assign(Error('Abort'),{name:'AbortError'}));};
  options.signal.addEventListener('abort',abort,{once:true});
  req.end=()=>queueMicrotask(()=>{
   if(aborted)return;calls.push({url:url.href,options});const row=pages.shift();
   response=Readable.from(row.chunks??[row.body??'<title>Page</title><p>Hello world</p>']);
   response.statusCode=row.status??200;response.headers={'content-type':'text/html; charset=utf-8',...row.headers};response.rawHeaders=Object.entries(response.headers).flat();
   response.once('close',()=>options.signal.removeEventListener('abort',abort));callback(response);
  });return req;
 };return{request,calls};
}
test('URLs are HTTP/S default-port only without credentials or ambiguous syntax',()=>{
 for(const value of ['file:///etc/passwd','https://user:password@example.org','https://example.org:444/','http://example.org:81','http://example.org\\@127.0.0.1',' https://example.org','https://example.org/\n'])assert.throws(()=>publicWebUrl(value));
 assert.equal(publicWebUrl('https://example.org:443/a?q=1#fragment').href,'https://example.org/a?q=1');
});
test('loopback, private, metadata, mapped, nonpublic and mixed DNS addresses are refused',async()=>{
 const addresses=['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','192.0.2.1','192.88.99.1','198.18.0.1','255.255.255.255','::1','::ffff:127.0.0.1','::ffff:10.0.0.1','::ffff:192.88.99.1','0:0::ffff:c058:6301','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::','3fff::1','3fff:fff::1'];
 for(const address of addresses)await assert.rejects(resolvePublicWebDestination(new URL('https://example.org'),{lookup:async()=>[{address,family:address.includes(':')?6:4}]}),{code:'PUBLIC_WEB_DESTINATION'},address);
 await assert.rejects(resolvePublicWebDestination(new URL('https://example.org'),{lookup:async()=>[...(await publicLookup()),{address:'127.0.0.1',family:4}]}),{code:'PUBLIC_WEB_DESTINATION'});
 await assert.rejects(resolvePublicWebDestination(new URL('http://2130706433')),{code:'PUBLIC_WEB_DESTINATION'});
 assert.equal((await resolvePublicWebDestination(new URL('https://example.org'),{lookup:publicLookup})).address,'93.184.216.34');
});
test('pinned public request has no credentials, proxy agent or account headers; text contains provenance',async()=>{
 const f=transport([{body:'<html><head><title>A &amp; B</title></head><body><script>secret instructions</script><style>hidden</style><h1>News</h1><p>Hello &lt;friend&gt; &#128512;</p></body></html>',headers:{'set-cookie':'session=should-not-repeat'}}]);
 const answer=await createPublicWebReader({lookup:publicLookup,request:f.request})('https://example.org/news#read');
 assert.equal(answer.title,'A & B');assert.equal(answer.sourceUrl,'https://example.org/news');assert.match(answer.text,/News\nHello <friend> 😀/);assert.doesNotMatch(answer.text,/secret|hidden/);assert.match(answer.notice,/Untrusted/);assert.equal(answer.truncated,false);assert.ok(Number.isFinite(Date.parse(answer.fetchedAt)));
 const options=f.calls[0].options;assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);assert.equal(options.method,'GET');assert.equal(options.headers.cookie,undefined);assert.equal(options.headers.authorization,undefined);
 options.lookup('example.org',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
});
test('redirect is re-resolved and cannot rebind, forward cookies, downgrade TLS, or exceed cap',async()=>{
 let lookups=0;const f=transport([{status:302,headers:{location:'/next','set-cookie':'session=private'}}]);
 await assert.rejects(createPublicWebReader({lookup:async()=>++lookups===1?publicLookup():[{address:'127.0.0.1',family:4}],request:f.request})('https://example.org/'),{code:'PUBLIC_WEB_DESTINATION'});assert.equal(f.calls.length,1);
 const privateRedirect=transport([{status:302,headers:{location:'https://169.254.169.254/latest/meta-data/'}}]);
 await assert.rejects(createPublicWebReader({lookup:publicLookup,request:privateRedirect.request})('https://example.org/'),{code:'PUBLIC_WEB_DESTINATION'});assert.equal(privateRedirect.calls.length,1);
 const downgrade=transport([{status:302,headers:{location:'http://example.org/'}}]);
 await assert.rejects(createPublicWebReader({lookup:publicLookup,request:downgrade.request})('https://example.org/'),{code:'PUBLIC_WEB_REDIRECT'});
 const loops=transport(Array.from({length:4},()=>({status:302,headers:{location:'/again'}})));
 await assert.rejects(createPublicWebReader({lookup:publicLookup,request:loops.request})('https://example.org/'),{code:'PUBLIC_WEB_REDIRECT_LIMIT'});
 const good=transport([{status:302,headers:{location:'/next','set-cookie':'session=private'}},{body:'done',headers:{'content-type':'text/plain'}}]);
 const result=await createPublicWebReader({lookup:publicLookup,request:good.request})('https://example.org/');assert.equal(result.sourceUrl,'https://example.org/next');assert.equal(good.calls[1].options.headers.cookie,undefined);
});
test('bounds compressed wire, decompressed body, output and supported formats',async()=>{
 for(const row of [
  {body:Buffer.alloc(PUBLIC_WEB_LIMITS.wire+1,65)},
  {body:gzipSync(Buffer.alloc(PUBLIC_WEB_LIMITS.body+1,65)),headers:{'content-encoding':'gzip'}},
  {body:'binary',headers:{'content-type':'application/pdf'}},
  {body:'x',headers:{'content-encoding':'unknown'}},
  {body:'x',status:401},
 ]){const f=transport([row]);await assert.rejects(createPublicWebReader({lookup:publicLookup,request:f.request})('https://example.org/'),error=>/^PUBLIC_WEB_(WIRE_LIMIT|BODY_LIMIT|CONTENT_TYPE|ENCODING|HTTP)$/.test(error.code));}
 const f=transport([{body:gzipSync(Buffer.from('hello gzip')),headers:{'content-encoding':'gzip','content-type':'text/plain'}}]);assert.equal((await createPublicWebReader({lookup:publicLookup,request:f.request})('https://example.org/')).text,'hello gzip');
 const large=transport([{body:'a'.repeat(PUBLIC_WEB_LIMITS.text+10),headers:{'content-type':'text/plain'}}]);const answer=await createPublicWebReader({lookup:publicLookup,request:large.request})('https://example.org/');assert.equal(answer.text.length,PUBLIC_WEB_LIMITS.text);assert.equal(answer.truncated,true);
});
test('deadline includes DNS and cancellation never starts a socket',async()=>{
 let requests=0;const keepalive=setTimeout(()=>{},1000);
 try{await assert.rejects(createPublicWebReader({lookup:()=>new Promise(()=>{}),request:()=>{requests++;},timeoutMs:20})('https://example.org/'),{code:'PUBLIC_WEB_TIMEOUT'});}finally{clearTimeout(keepalive);}
 const controller=new AbortController();controller.abort();await assert.rejects(createPublicWebReader({request:()=>{requests++;}})('https://example.org/',{signal:controller.signal}),{code:'PUBLIC_WEB_CANCELLED'});assert.equal(requests,0);
});
test('text extraction strips executable/embedded source without interpreting encoded markup',()=>{
 const result=extractPublicWebText('<title>T</title><!--x--><template>bad</template><iframe>bad</iframe><svg>bad</svg><p>&lt;script&gt;literal&lt;/script&gt;</p>');
 assert.equal(result.title,'T');assert.doesNotMatch(result.text,/bad/);assert.match(result.text,/<script>literal<\/script>/);
 assert.equal(extractPublicWebText('plain <text>',{html:false}).text,'plain <text>');
 assert.equal(extractPublicWebText('<title'.repeat(30000)).text,'');
 assert.equal(extractPublicWebText('<title>'.repeat(30000)).title,null);
 assert.equal(extractPublicWebText('<'+' '.repeat(200000)+'>ok').text,'ok');
 assert.equal(extractPublicWebText('İ<TITLE>Name</TITLE><script>bad</script><p>Visible</p>').title,'Name');
});
