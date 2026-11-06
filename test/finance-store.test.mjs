import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createFinanceStore} from '../src/finance/store.mjs';
export function protection(){const key=randomBytes(32);return{available:()=>true,encrypt:async text=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]);},decrypt:async bytes=>{const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');}};}
test('encrypted atomic store reopens without plaintext bank data and failed encryption preserves prior bytes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'finance-store-'));try{const p=protection(),store=await createFinanceStore({dir,protection:p});await store.write({version:1,secret:'sensitive-bank-token',transactions:[{merchant:'Private Merchant'}]});const bytes=await readFile(path.join(dir,'finance.bin'));assert(!bytes.includes(Buffer.from('sensitive-bank-token')));assert(!bytes.includes(Buffer.from('Private Merchant')));assert.equal((await createFinanceStore({dir,protection:p})).read().secret,'sensitive-bank-token');p.encrypt=async()=>{throw Error('fail');};await assert.rejects(store.write({version:1,secret:'replacement'}));assert.deepEqual(await readFile(path.join(dir,'finance.bin')),bytes);}finally{await rm(dir,{recursive:true,force:true});}
});
test('unavailable protection and corrupt ciphertext fail closed without overwriting',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'finance-corrupt-'));try{const store=await createFinanceStore({dir,protection:{available:()=>false}});await assert.rejects(store.write({version:1}),/Protected/);await writeFile(path.join(dir,'finance.bin'),'corrupt');await assert.rejects(createFinanceStore({dir,protection:protection()}),/Protected|read/);assert.equal(await readFile(path.join(dir,'finance.bin'),'utf8'),'corrupt');}finally{await rm(dir,{recursive:true,force:true});}
});
