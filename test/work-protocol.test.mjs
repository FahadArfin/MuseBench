import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactId,createArtifactHandler} from '../electron/work-protocol.mjs';
const id='82b2492e-799d-4ae1-b271-09ca6c5632cd';
test('artifact protocol accepts only exact saved preview destinations',()=>{
 assert.equal(artifactId(`musebench-artifact://preview/${id}?rev=now`),id);
 for(const url of ['https://preview/'+id,'musebench-artifact://preview/../../secrets','musebench-artifact://evil/'+id,'musebench-artifact://user@preview/'+id,'musebench-artifact://preview:123/'+id,'musebench-artifact://preview/'+id+'/file'])assert.equal(artifactId(url),null,url);
});
test('artifact handler refuses invalid routes and methods before resolving data',async()=>{
 let reads=0;const handler=createArtifactHandler({getArtifact:async()=>{reads++;return null;},render:()=>''});
 assert.equal((await handler({url:'musebench-artifact://preview/etc',method:'GET'})).status,404);
 assert.equal((await handler({url:`musebench-artifact://preview/${id}`,method:'POST'})).status,405);
 assert.equal(reads,0);assert.equal((await handler({url:`musebench-artifact://preview/${id}`,method:'GET'})).status,404);
});
test('artifact handler returns only rendered saved content with no caching',async()=>{
 const handler=createArtifactHandler({getArtifact:async requested=>requested===id?{title:'Fixture'}:null,render:value=>'<html>'+value.title+'</html>',getTheme:()=> 'dark'});
 const response=await handler({url:`musebench-artifact://preview/${id}`,method:'GET'});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');assert.match(await response.text(),/Fixture/);
 const failed=createArtifactHandler({getArtifact:async()=>{throw Error('secret path');},render:()=>''});
 const error=await failed({url:`musebench-artifact://preview/${id}`,method:'GET'});assert.equal(error.status,500);assert.doesNotMatch(await error.text(),/secret/);
});
