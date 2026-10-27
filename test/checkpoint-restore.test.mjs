import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {restoreSelected} from '../src/controller/checkpoint-restore.mjs';
const file=text=>({text,binary:false,hash:createHash('sha256').update(text).digest('hex')});
test('selected restore preserves unrelated files and supports redo from durable preimages',async t=>{
 const root=await mkdtemp(join(tmpdir(),'muse-restore-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'one.txt'),'new');await writeFile(join(root,'other.txt'),'unrelated');let journal;
 await restoreSelected({root,before:{'one.txt':file('new')},after:{'one.txt':file('old'),'nested/two.txt':file('created')},paths:['one.txt','nested/two.txt'],record:value=>{journal=structuredClone(value);}});
 assert.equal(await readFile(join(root,'one.txt'),'utf8'),'old');assert.equal(await readFile(join(root,'other.txt'),'utf8'),'unrelated');assert.equal(journal.status,'completed');
 await restoreSelected({root,before:journal.after,after:journal.before,paths:journal.paths,record:()=>{}});assert.equal(await readFile(join(root,'one.txt'),'utf8'),'new');await assert.rejects(readFile(join(root,'nested/two.txt')),/ENOENT/);
});
test('conflicts reject the entire reviewed selection before mutation; paths and binary are refused',async t=>{
 const root=await mkdtemp(join(tmpdir(),'muse-restore-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'one.txt'),'changed');
 await assert.rejects(restoreSelected({root,before:{'one.txt':file('old')},after:{'one.txt':file('restore')},paths:['one.txt'],record:()=>{}}),/changed/);assert.equal(await readFile(join(root,'one.txt'),'utf8'),'changed');
 for(const name of ['../outside','.git/config','x/../one.txt','C:/outside'])await assert.rejects(restoreSelected({root,before:{},after:{[name]:file('bad')},paths:[name],record:()=>{}}),/path/i);
 await assert.rejects(restoreSelected({root,before:{'one.txt':file('changed')},after:{'one.txt':{binary:true}},paths:['one.txt'],record:()=>{}}),/binary/i);
});
test('an interrupted restore retains a journal before writing and can be reconciled without guessing',async t=>{
 const root=await mkdtemp(join(tmpdir(),'muse-restore-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'one.txt'),'new');let journal;
 await assert.rejects(restoreSelected({root,before:{'one.txt':file('new')},after:{'one.txt':file('old')},paths:['one.txt'],record:value=>{journal=structuredClone(value);if(value.completed.length)throw Error('simulated interruption');}}),/interruption/);
 assert.ok(journal.before['one.txt']);assert.equal(await readFile(join(root,'one.txt'),'utf8'),'old');
});
