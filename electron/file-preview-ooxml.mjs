import yauzl from 'yauzl';
import {crc32} from 'node:zlib';

// Validate the complete inflation stream before any browser ZIP parser sees it.
const ENTRY_LIMIT=32*1024*1024,TOTAL_LIMIT=256*1024*1024,COUNT_LIMIT=10000;
export async function validateOfficeArchive(bytes,kind){
 let archive;
 try{
  archive=await yauzl.fromBufferPromise(bytes,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true});
  if(archive.entryCount>COUNT_LIMIT)throw Error('Office archive entry limit exceeded.');
  let expanded=0,count=0;const names=new Set(),deadline=Date.now()+15000;
  for await(const entry of archive.eachEntry()){
   if(++count>COUNT_LIMIT||Date.now()>deadline)throw Error('Office archive validation limit exceeded.');
   const name=entry.fileName;
   if(name.length>1000||/[\\:\x00-\x1f]/.test(name)||name.startsWith('/')||name.split('/').some(part=>part==='..'||part==='.')||names.has(name))throw Error('Unsafe Office archive entry path.');
   names.add(name);
   if((entry.externalFileAttributes>>>16&0xf000)===0xa000||entry.generalPurposeBitFlag&1||/vbaProject|activeX|macros?/i.test(name))throw Error('Macro, encrypted or linked Office archive entries are unsupported.');
   if(![0,8].includes(entry.compressionMethod)||entry.uncompressedSize>ENTRY_LIMIT||expanded+entry.uncompressedSize>TOTAL_LIMIT||entry.uncompressedSize>Math.max(1024*1024,entry.compressedSize*250))throw Error('Office archive inflation or size limit exceeded.');
   if(name.endsWith('/'))continue;
   const stream=await archive.openReadStreamPromise(entry);let actual=0,checksum=0,tail='';
   try{
    for await(const chunk of stream){
     actual+=chunk.length;expanded+=chunk.length;
     if(actual>entry.uncompressedSize||actual>ENTRY_LIMIT||expanded>TOTAL_LIMIT||Date.now()>deadline)throw Error('Office archive actual inflation limit exceeded.');
     checksum=crc32(chunk,checksum);
     if(/\.(?:xml|rels)$/i.test(name)){
      const text=tail+chunk.toString('utf8');
      if(/<!DOCTYPE|<!ENTITY|macroEnabled/i.test(text))throw Error('Active or macro Office XML is unsupported.');
      tail=text.slice(-64);
     }
    }
   }finally{stream.destroy();}
   if(actual!==entry.uncompressedSize||checksum!==entry.crc32)throw Error('Office archive size or CRC integrity check failed.');
  }
  if(!names.has('[Content_Types].xml')||!names.has(kind==='docx'?'word/document.xml':'ppt/presentation.xml'))throw Error('The Office document does not match its file format.');
 }catch(error){throw Error('Office archive cannot be previewed: '+String(error.message).slice(0,220));}
 finally{archive?.close();}
}
