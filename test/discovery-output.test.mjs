import test from 'node:test';
import assert from 'node:assert/strict';
const output=await import('../src/runtime/discovery-output.mjs').catch(()=>({}));
const receipt={sourceId:'global:fixture',sourceName:'fixture',catalogRevision:'a'.repeat(64),tool:'allowed'};
const wireBytes=(value,id='\u0000'.repeat(128))=>Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}]}})+'\n');
function bound(result,identity=receipt){assert.equal(typeof output.boundDiscoveryResult,'function','bounded output helper exists');return output.boundDiscoveryResult(identity,result);}
for(const result of [{content:[{type:'text',text:'small'}],_meta:{source:'kept'},truncated:true},{content:[],isError:true,structuredContent:{reason:'small'}}])test('small validated results retain their complete source shape',()=>{
 assert.deepEqual(bound(result),{...receipt,outcome:result.isError?'failed':'completed',result});
});
for(const isError of [false,true])test(`large ${isError?'failed':'completed'} result preserves source identity and useful head/tail`,()=>{
 const text='BEGIN:'+ 'middle'.repeat(30000)+':END',result={content:[{type:'text',text}],isError,truncated:true};
 const value=bound(result);assert.equal(value.outcome,isError?'failed':'completed');for(const key of Object.keys(receipt))assert.equal(value[key],receipt[key]);
 assert.equal(value.truncated,true);assert.equal(value.result,undefined);assert.ok(value.preview.text.startsWith('BEGIN:'));assert.ok(value.preview.text.endsWith(':END'));
 assert.ok(Array.from(value.preview.text).length<=16000);assert.match(value.preview.text,/omitted/);assert.match(value.notice,/lossy|preview/i);assert.match(value.notice,/source.*truncat/i);
 assert.equal(value.preview.originalWireBytes,wireBytes({...receipt,outcome:value.outcome,result}));assert.equal(value.preview.omittedNonTextBlocks,0);
 const marker=value.preview.text.match(/\n\[.*?omitted.*?\]\n/);assert.ok(marker);assert.equal(value.preview.omittedTextCodePoints,Array.from(text).length-(Array.from(value.preview.text).length-Array.from(marker[0]).length));
 assert.ok(wireBytes(value)<=131072);
});
test('preview concatenates text blocks only and omits structured content, metadata and media',()=>{
 const result={content:[{type:'text',text:'FIRST'+ 'a'.repeat(100000)},{type:'image',data:'PRIVATE_IMAGE',mimeType:'image/png'},{type:'text',text:'b'.repeat(100000)+'LAST'},{type:'audio',data:'PRIVATE_AUDIO',mimeType:'audio/wav'}],structuredContent:{private:'PRIVATE_STRUCTURED'},_meta:{private:'PRIVATE_METADATA'}};
 const value=bound(result);assert.ok(value.preview.text.startsWith('FIRST'));assert.ok(value.preview.text.endsWith('LAST'));assert.equal(value.preview.omittedNonTextBlocks,2);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_/);assert.match(value.notice,/structured.*metadata/i);
});
for(const content of [[],[{type:'image',data:'x'.repeat(150000),mimeType:'image/png'}]])test(`oversized ${content.length?'media':'structured'}-only output explains omissions without inventing text`,()=>{
 const value=bound({content,structuredContent:{value:'PRIVATE'.repeat(30000)}});assert.equal(value.preview.text,'');assert.equal(value.preview.omittedTextCodePoints,0);assert.equal(value.preview.omittedNonTextBlocks,content.length);assert.match(value.notice,/no.*text/i);assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);
});
test('code point slicing preserves astral characters and counts combining marks separately',()=>{
 const text=('😀e\u0301').repeat(60000),value=bound({content:[{type:'text',text}]});
 assert.ok(Array.from(value.preview.text).length<=16000);assert.equal(value.preview.text.isWellFormed(),true);assert.ok(value.preview.text.includes('😀'));assert.ok(value.preview.text.includes('\u0301'));
 const marker=value.preview.text.match(/\n\[.*?omitted.*?\]\n/);assert.equal(value.preview.omittedTextCodePoints,180000-Array.from(value.preview.text.replace(marker[0],'')).length);
});
test('quotes, backslashes and long receipt identity are bounded after nested JSON encoding',()=>{
 const identity={...receipt,sourceName:'\\"'.repeat(13000)},value=bound({content:[{type:'text',text:'\\"'.repeat(100000)}]},identity);
 assert.ok(wireBytes(value)<=131072);assert.ok(Array.from(value.preview.text).length<16000,'whole frame forces a smaller preview');assert.ok(value.preview.text.length>1000);
 assert.equal(output.discoveryResultWireBytes(value),wireBytes(value));
});
test('complete frames at the byte limit pass through and one byte over receives a preview',()=>{
 const empty={...receipt,outcome:'completed',result:{content:[{type:'text',text:''}]}},capacity=131072-wireBytes(empty);
 const result={content:[{type:'text',text:'x'.repeat(capacity)}]};assert.equal(wireBytes({...empty,result}),131072);assert.deepEqual(bound(result),{...empty,result});
 const larger={content:[{type:'text',text:'x'.repeat(capacity+1)}]};const value=bound(larger);assert.equal(value.truncated,true);assert.equal(value.preview.originalWireBytes,131073);assert.ok(wireBytes(value)<=131072);
});

test('many text blocks retain their ordered beginning/end and count all omitted source code points',()=>{
 const content=Array.from({length:500},(_,index)=>({type:'text',text:index===0?'FIRST'+ 'x'.repeat(400):index===499?'x'.repeat(400)+'LAST':'x'.repeat(400)}));
 const value=bound({content}),marker=value.preview.text.match(/\n\[.*?omitted.*?\]\n/);assert.ok(value.preview.text.startsWith('FIRST'));assert.ok(value.preview.text.endsWith('LAST'));assert.equal(value.preview.omittedNonTextBlocks,0);assert.equal(value.preview.omittedTextCodePoints,200009-Array.from(value.preview.text.replace(marker[0],'')).length);
});
test('emitted MCP frames admit both the exact limit and a bounded escaped preview without fallback',async()=>{
 const {PassThrough}=await import('node:stream'),{createDiscoveryMcpServer}=await import('../src/runtime/discovery-mcp.mjs');
 const empty={...receipt,outcome:'completed',result:{content:[{type:'text',text:''}]}},capacity=131072-wireBytes(empty),results=[{content:[{type:'text',text:'x'.repeat(capacity)}]},{content:[{type:'text',text:'\\"'.repeat(100000)}]}];
 for(const result of results){
  const input=new PassThrough(),stream=new PassThrough(),frames=[];let calls=0;stream.on('data',chunk=>frames.push(String(chunk)));
  const server=await createDiscoveryMcpServer({input,output:stream,service:{call:async()=>{calls++;return bound(result);},dispose:async()=>{}}});
  try{input.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}})+'\n');await new Promise(resolve=>setImmediate(resolve));input.write(JSON.stringify({jsonrpc:'2.0',id:'\u0000'.repeat(128),method:'tools/call',params:{name:'discovery_call',arguments:{}}})+'\n');await new Promise(resolve=>setImmediate(resolve));
   const frame=frames[1];assert.ok(Buffer.byteLength(frame)<=131072);const parsed=JSON.parse(JSON.parse(frame).result.content[0].text);assert.equal(parsed.outcome,'completed');assert.equal(parsed.sourceId,receipt.sourceId);assert.equal(calls,1);if(result===results[1])assert.ok(parsed.preview.text.length>0);else assert.equal(Buffer.byteLength(frame),131072);
  }finally{await server.close();}
 }
});

for(const [kind,id] of [['backslash','\\'.repeat(128)],['quote','"'.repeat(128)],['control','\u0000'.repeat(128)],['multibyte','漢'.repeat(128)],['lone-surrogate','\ud800'.repeat(128)],['astral','😀'.repeat(64)]])test(`near-limit result retains receipt and preview for an admitted ${kind} request ID`,async()=>{
 const {PassThrough}=await import('node:stream'),{createDiscoveryMcpServer}=await import('../src/runtime/discovery-mcp.mjs');
 const empty={...receipt,outcome:'completed',result:{content:[{type:'text',text:''}]}},capacity=131072-wireBytes(empty,'x'.repeat(128)),result={content:[{type:'text',text:'x'.repeat(capacity)}]};
 const input=new PassThrough(),stream=new PassThrough(),frames=[];let calls=0;stream.on('data',chunk=>frames.push(String(chunk)));
 const server=await createDiscoveryMcpServer({input,output:stream,service:{call:async()=>{calls++;return bound(result);},dispose:async()=>{}}});
 try{
  input.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}})+'\n');await new Promise(resolve=>setImmediate(resolve));
  input.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'discovery_call',arguments:{}}})+'\n');await new Promise(resolve=>setImmediate(resolve));
  const frame=frames[1],reply=JSON.parse(frame);assert.equal(reply.id,id);assert.ok(Buffer.byteLength(frame)<=131072);assert.equal(reply.result.isError,undefined,'must not use the generic overflow fallback');
  const value=JSON.parse(reply.result.content[0].text);assert.equal(value.outcome,'completed');assert.equal(value.sourceId,receipt.sourceId);assert.equal(value.catalogRevision,receipt.catalogRevision);assert.equal(value.truncated,true);assert.ok(value.preview.text.length>0);assert.equal(value.preview.originalWireBytes,131712);assert.equal(calls,1);
 }finally{await server.close();}
});
