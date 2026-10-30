import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,truncate} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {deflateRawSync} from 'node:zlib';
import {createConversationImportReader} from '../src/controller/conversation-import-reader.mjs';
import {IMPORT_LIMITS} from '../src/shared/conversation-import.mjs';

// Actual ZIP records exercise yauzl validation and streaming, not a mocked reader.
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let n=0;n<8;n++)crc=crc>>>1^(crc&1?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
export function zip(entries){
 const chunks=[],central=[];let offset=0;
 for(const [name,text] of entries){const file=Buffer.from(name),data=Buffer.from(text),compressed=deflateRawSync(data),crc=crc32(data),header=Buffer.alloc(30),record=Buffer.alloc(46);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(file.length,26);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(8,10);record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(file.length,28);record.writeUInt32LE(offset,42);chunks.push(header,file,compressed);central.push(record,file);offset+=header.length+file.length+compressed.length;}
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,directory,end]);
}
const exported=title=>JSON.stringify([{name:title,chat_messages:[{sender:'human',text:'A question'},{sender:'assistant',text:'A preserved answer'}]}]);
async function fixture(t,options){const root=await mkdtemp(path.join(tmpdir(),'muse-import-reader-')),reader=createConversationImportReader(options);t.after(async()=>{await reader.close();await rm(root,{recursive:true,force:true,maxRetries:5});});return{root,reader};}

test('worker reads only conversation ZIP entries without extracting or modifying source bytes',async t=>{
 const {root,reader}=await fixture(t),file=path.join(root,'export.zip'),original=zip([['conversations.json',exported('First')],['conversations-001.json',exported('Second')],['users.json','{"token":"never import"}'],['images/photo.png','not an image']]);await writeFile(file,original);
 const result=await reader.read(file);assert.deepEqual(result.parsed.conversations.map(c=>c.title),['First','Second']);assert.match(result.digest,/^[a-f0-9]{64}$/);assert.equal(result.fileName,'export.zip');assert.doesNotMatch(JSON.stringify(result.parsed),/token|never import|photo/);assert.deepEqual(await readFile(file),original);
 const verified=await reader.read(file,{expectedDigest:result.digest});assert.equal(verified.digest,result.digest);assert.equal(verified.parsed,undefined);
 await writeFile(file,zip([['conversations.json',exported('Changed')]]));await assert.rejects(reader.read(file,{expectedDigest:result.digest}),/changed/i);
});
test('archive traversal, unsupported content, decoded expansion and file bounds fail closed',async t=>{
 const {root,reader}=await fixture(t);for(const [name,content,pattern] of [['bad.zip',zip([['../conversations.json',exported('Bad')]]),/ZIP|path/i],['empty.zip',zip([['users.json','{}']]),/conversation/i],['bomb.zip',zip([['conversations.json','x'.repeat(IMPORT_LIMITS.decodedBytes+1)]]),/32 MiB|limit/i],['bad.json',Buffer.from([0xff,0xfe,0xff]),/UTF-8/i]]){const file=path.join(root,name);await writeFile(file,content);await assert.rejects(reader.read(file),pattern);}
 const large=path.join(root,'too-big.zip');await writeFile(large,'');await truncate(large,IMPORT_LIMITS.sourceBytes+1);await assert.rejects(reader.read(large),/128 MiB/i);await assert.rejects(reader.read('relative.json'),/absolute/i);
});
test('worker timeouts and close settle pending reads and prohibit new reads',async t=>{
 const {root,reader}=await fixture(t,{timeoutMs:1}),file=path.join(root,'conversations.json');await writeFile(file,exported('Timed'));
 await assert.rejects(reader.read(file),/time limit/i);
 const next=createConversationImportReader();const pending=next.read(file);const rejected=assert.rejects(pending,/closed/i);await next.close();await rejected;await assert.rejects(next.read(file),/closed/i);
});

test('ZIP shards without readable text are skipped while their source messages count toward the archive limit',async t=>{
 const {root,reader}=await fixture(t),file=path.join(root,'shards.zip');
 await writeFile(file,zip([['conversations-0.json','[]'],['conversations-1.json',JSON.stringify([{name:'No text',chat_messages:[{sender:'assistant',content:[{type:'thinking',thinking:'excluded'}]}]}])],['conversations-2.json',exported('Readable')]]));
 const result=await reader.read(file);assert.equal(result.parsed.conversations[0].title,'Readable');assert.equal(result.parsed.skippedConversations,1);
 const empty=JSON.stringify([{name:'No text',chat_messages:Array.from({length:26000},()=>({sender:'tool',text:'not public text'}))}]);
 await writeFile(file,zip([['conversations-0.json',empty],['conversations-1.json',empty],['conversations-2.json',exported('Readable')]]));await assert.rejects(reader.read(file),/message|limit/i);
});

test('valid JSON in a ZIP entry with a corrupt CRC is rejected before preview',async t=>{
 const {root,reader}=await fixture(t),file=path.join(root,'crc-corrupt.zip'),data=zip([['conversations.json',exported('Intact JSON')]]);
 // Both ZIP headers agree, but neither matches the decompressed entry bytes.
 data.writeUInt32LE((data.readUInt32LE(14)^1)>>>0,14);const central=data.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));data.writeUInt32LE((data.readUInt32LE(central+16)^1)>>>0,central+16);await writeFile(file,data);
 await assert.rejects(reader.read(file),/checksum|CRC|corrupt/i);
});
