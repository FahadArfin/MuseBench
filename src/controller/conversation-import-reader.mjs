import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {open} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import yauzl from 'yauzl';
import {IMPORT_LIMITS,parseConversationExport} from '../shared/conversation-import.mjs';

export function createConversationImportReader({timeoutMs=30000}={}){
 let closed=false,active=null;
 return{
  async read(source,{expectedDigest}={}){
   if(closed)throw Error('Conversation import reader closed.');
   if(typeof source!=='string'||!path.isAbsolute(source)||source.length>32768)throw Error('Choose an absolute local export file.');
   if(!/\.(json|zip|md|txt)$/i.test(source))throw Error('Choose a JSON, ZIP, Markdown or text export.');
   if(expectedDigest!==undefined&&!/^[a-f0-9]{64}$/.test(expectedDigest))throw Error('Invalid source digest.');
   if(active)throw Error('Another export is being read.');
   return new Promise((resolve,reject)=>{
    let worker,finishing,timer;
    const finish=(error,value)=>{
     if(finishing)return finishing;
     clearTimeout(timer);
     finishing=(async()=>{await worker?.terminate().catch(()=>{});active=null;error?reject(error):resolve(value);})();return finishing;
    };
    active={finish};timer=setTimeout(()=>void finish(Error('Conversation import exceeded its time limit. Choose a smaller export.')),timeoutMs);
    try{
     worker=new Worker(new URL(import.meta.url),{workerData:{kind:'conversation-import',source,expectedDigest},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
     worker.once('message',value=>void finish(value.error?Error(value.error):null,value.result));
     worker.once('error',()=>void finish(Error('The export could not be read within the worker resource limits.')));
     worker.once('exit',()=>{if(!finishing)void finish(Error('The export reader stopped before completing.'));});
    }catch(error){void finish(error);}
   });
  },
  async close(){closed=true;await active?.finish(Error('Conversation import reader closed.'));},
 };
}

async function readBounded(source){
 const handle=await open(source,'r');
 try{
  const stat=await handle.stat();if(!stat.isFile())throw Error('Choose a regular export file.');
  if(stat.size>IMPORT_LIMITS.sourceBytes)throw Error('Export exceeds the 128 MiB file limit.');
  const chunks=[];let total=0;
  for(;;){const chunk=Buffer.alloc(64*1024),{bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;total+=bytesRead;if(total>IMPORT_LIMITS.sourceBytes)throw Error('Export exceeds the 128 MiB file limit.');chunks.push(chunk.subarray(0,bytesRead));}
  return Buffer.concat(chunks,total);
 }finally{await handle.close();}
}
function decode(buffer){try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw Error('Export must contain valid UTF-8 text.');}}
// yauzl verifies entry sizes, but explicitly leaves CRC verification to callers.
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value>>>1^(value&1?0xedb88320:0);return value>>>0;});
const updateCrc=(crc,chunk)=>{for(const byte of chunk)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc;};
function readZip(buffer){
 return new Promise((resolve,reject)=>{
  yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true},(error,archive)=>{
   if(error){reject(Error('Invalid or unsupported ZIP export.'));return;}
   let settled=false,entries=0,decoded=0,totalMessages=0;const parsed={conversations:[],skippedConversations:0,textBytes:0};
   const finish=error=>{if(settled)return;settled=true;archive.close();error?reject(error):resolve(parsed);};
   archive.on('error',error=>finish(Error(`ZIP export could not be read: ${String(error.message).slice(0,300)}`)));
   archive.on('end',()=>finish(parsed.conversations.length?null:Error('ZIP has no readable conversation JSON entries.')));
   archive.on('entry',entry=>{
    if(++entries>10000){finish(Error('ZIP exceeds the 10,000-entry limit.'));return;}
    if(!/(?:^|\/)conversations(?:[-_]\d+)?\.json$/i.test(entry.fileName)){archive.readEntry();return;}
    if(decoded+entry.uncompressedSize>IMPORT_LIMITS.decodedBytes){finish(Error('ZIP exceeds the 32 MiB decoded-text limit.'));return;}
    archive.openReadStream(entry,async(error,stream)=>{
     if(error){finish(Error('Conversation JSON in ZIP could not be opened.'));return;}
     try{
      const chunks=[];let crc=0xffffffff;for await(const chunk of stream){decoded+=chunk.length;if(decoded>IMPORT_LIMITS.decodedBytes)throw Error('ZIP exceeds the 32 MiB decoded-text limit.');crc=updateCrc(crc,chunk);chunks.push(chunk);}
      if(settled)return;
      if(((crc^0xffffffff)>>>0)!==entry.crc32)throw Error('Conversation JSON has an invalid ZIP checksum (CRC-32). Choose a fresh export.');
      const part=parseConversationExport(decode(Buffer.concat(chunks)),entry.fileName,{allowEmpty:true});
      parsed.conversations.push(...part.conversations);parsed.skippedConversations+=part.skippedConversations;parsed.textBytes+=part.textBytes;
      totalMessages+=part.sourceMessageCount;
      if(parsed.conversations.length+parsed.skippedConversations>IMPORT_LIMITS.conversations||totalMessages>IMPORT_LIMITS.messages||parsed.textBytes>IMPORT_LIMITS.textBytes)throw Error('ZIP exceeds the conversation, message or saved-text import limit.');
      archive.readEntry();
     }catch(error){stream.destroy();finish(error);}
    });
   });
   archive.readEntry();
  });
 });
}
async function readSource({source,expectedDigest}){
 const buffer=await readBounded(source),digest=createHash('sha256').update(buffer).digest('hex');
 if(expectedDigest!==undefined){if(digest!==expectedDigest)throw Error('The export changed after preview. Choose it again before importing.');return{digest};}
 const fileName=path.basename(source).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,200);
 if(!/\.zip$/i.test(source)&&buffer.length>IMPORT_LIMITS.decodedBytes)throw Error('Export exceeds the 32 MiB decoded-text limit.');
 const parsed=/\.zip$/i.test(source)?await readZip(buffer):parseConversationExport(decode(buffer),fileName);
 return{digest,fileName,parsed};
}
if(!isMainThread&&workerData?.kind==='conversation-import'){
 try{parentPort.postMessage({result:await readSource(workerData)});}
 catch(error){parentPort.postMessage({error:error.code?`Could not read the selected export (${error.code}).`:String(error.message).slice(0,400)});}
}
