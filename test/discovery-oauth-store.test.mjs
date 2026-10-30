import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {storeFixture,sourceInput} from './fixtures/discovery-oauth-store.mjs';

test('same-scope token rotation preserves auth binding and saved native identity',async t=>{
 const f=await storeFixture(t),initial=await f.enroll(),tx=await f.store.beginRefresh(initial.binding.bindingRevision,{expectedTokenGeneration:0});
 const next=await f.store.completeRefresh(tx.transactionId,f.rotatedTokens);assert.equal(next.binding.bindingRevision,initial.binding.bindingRevision);assert.equal(next.tokenGeneration,1);assert.equal(f.restore(next).id,'fixture-native-session');
 assert.doesNotMatch((await fs.readFile(f.file)).toString(),/secret-access|secret-refresh/);await f.reopen();assert.equal(f.store.get(f.authSource).tokens.accessToken,'secret-access-rotated');
});
test('restart with refresh intent requires reauthorization and performs no network',async t=>{
 const f=await storeFixture(t),g=await f.enroll(),tx=await f.store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:0});await f.reopen();
 assert.equal(f.store.get(f.authSource).phase,'reauthorization-required');assert.equal(f.store.get(f.authSource).tokens.refreshToken,undefined);assert.equal(f.networkRequests,0);
 await assert.rejects(f.store.completeRefresh(tx.transactionId,f.rotatedTokens));await assert.rejects(f.store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:0}));
});
test('refresh intent commits before material is returned and failed completion retains intent',async t=>{
 const f=await storeFixture(t),g=await f.enroll();f.faults.rename=true;await assert.rejects(f.store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:0}));assert.equal(f.store.get(f.authSource).phase,'ready');
 f.faults.rename=false;const tx=await f.store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:0});f.faults.rename=true;await assert.rejects(f.store.completeRefresh(tx.transactionId,f.rotatedTokens));assert.equal(f.store.get(f.authSource).phase,'refresh-in-flight');
 const durable=JSON.parse((await f.protection.decrypt(await fs.readFile(f.file))).result);assert.equal(durable.grants[0].phase,'refresh-in-flight');f.faults.rename=false;
 const next=await f.store.completeRefresh(tx.transactionId,f.rotatedTokens);assert.equal(next.tokens.refreshToken,'secret-refresh-rotated');await assert.rejects(f.store.completeRefresh(tx.transactionId,f.rotatedTokens));
});
test('failed CAS preserves unrelated grants and serializes competing mutations',async t=>{
 const f=await storeFixture(t),g=await f.enroll(),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');
 const other=f.grant({binding:normalizeAuthBinding({...g.binding,grantId:'other',sourceId:'global:other',bindingRevision:undefined})});
 const generation=f.store.inspect().generation;const results=await Promise.allSettled([f.store.commitGrant(other,{expectedGeneration:generation}),f.store.forget(g.binding.bindingRevision,{expectedGeneration:generation})]);assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);assert.equal(f.store.get(f.authSource).binding.grantId,g.binding.grantId);
 const external=await f.protection.encrypt(JSON.stringify({version:1,generation:99,grants:[g,other]}));await fs.writeFile(f.file,external);await assert.rejects(f.store.forget(g.binding.bindingRevision,{expectedGeneration:f.store.inspect().generation}));assert.deepEqual(await fs.readFile(f.file),external);
 assert.equal(f.store.inspect().status,'unavailable');assert.equal(f.store.get(f.authSource),null);
});
test('unreadable and future envelopes preserve exact bytes',async t=>{
 const f=await storeFixture(t);for(const bytes of [Buffer.from('corrupt-protected'),await f.protection.encrypt(JSON.stringify({version:2,generation:4,grants:[]})),await f.protection.encrypt('{broken'),Buffer.alloc(1048577)]){
 await f.store.close();await fs.writeFile(f.file,bytes);await f.reopen();assert.notEqual(f.store.inspect().status,'ready');await assert.rejects(f.enroll());assert.deepEqual(await fs.readFile(f.file),bytes);
 }
});
test('unavailable protection never stores plaintext or overwrites credentials',async t=>{
 const f=await storeFixture(t);await f.enroll();const before=await fs.readFile(f.file);f.protection.available=async()=>false;await f.reopen();assert.equal(f.store.inspect().status,'unavailable');await assert.rejects(f.enroll());assert.deepEqual(await fs.readFile(f.file),before);
});
test('shouldReEncrypt rewrites once and preserves all grants',async t=>{
 const f=await storeFixture(t);await f.enroll();const decrypt=f.protection.decrypt;let needed=true,encryptions=0;const encrypt=f.protection.encrypt;f.protection.encrypt=async text=>{encryptions++;return encrypt(text);};f.protection.decrypt=async bytes=>({...await decrypt(bytes),shouldReEncrypt:needed});await f.reopen();assert.equal(f.store.inspect().status,'ready');assert.equal(encryptions,1);needed=false;await f.reopen();assert.equal(encryptions,1);assert.equal(f.store.get(f.authSource).binding.grantId,'enrollment-fixture');
});
test('store limits do not evict records',async t=>{
 const f=await storeFixture(t),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');let envelope={version:1,generation:1,grants:[]};
 for(let i=0;i<100;i++)envelope.grants.push(f.grant({binding:normalizeAuthBinding({...f.grant().binding,grantId:`g${i}`,sourceId:`global:g${i}`,bindingRevision:undefined})}));
 await fs.writeFile(f.file,await f.protection.encrypt(JSON.stringify(envelope)));await f.reopen();assert.equal(f.store.inspect().status,'ready');const before=await fs.readFile(f.file);await assert.rejects(f.enroll(),/limit|full/i);assert.deepEqual(await fs.readFile(f.file),before);assert.ok(f.store.get({sourceId:'global:g99',authSourceIdentity:f.authSource.authSourceIdentity}));
});
test('scope token client grant and depth bounds reject overflow without losing records',async t=>{
 const f=await storeFixture(t),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');const g=await f.enroll();
 const commit=grant=>f.store.commitGrant(grant,{expectedGeneration:f.store.inspect().generation});
 await commit({...g,tokens:{...g.tokens,accessToken:'a'.repeat(16384)},registration:{...g.registration,clientId:'c'.repeat(16384)}});
 for(const change of [{tokens:{...g.tokens,accessToken:'a'.repeat(16385)}},{tokens:{...g.tokens,refreshToken:'r'.repeat(16385)}},{registration:{...g.registration,clientId:'c'.repeat(16385)}},{metadata:{padding:'x'.repeat(65536)}}])await assert.rejects(commit({...g,...change}));
 for(const scopes of [Array.from({length:257},(_,i)=>`scope${i}`),['x'.repeat(201)],['bad\ncontrol'],['duplicate','duplicate']])assert.throws(()=>normalizeAuthBinding({...g.binding,scopes,bindingRevision:undefined}));
 const scopes=Array.from({length:256},(_,i)=>`scope${i}`);await commit({...g,binding:normalizeAuthBinding({...g.binding,grantId:'scope-boundary',scopes,bindingRevision:undefined})});await commit({...g,binding:normalizeAuthBinding({...g.binding,grantId:'label-boundary',scopes:['x'.repeat(200)],bindingRevision:undefined})});
 let nested='leaf';for(let i=0;i<17;i++)nested={nested};await assert.rejects(commit({...g,metadata:nested}));assert.equal(f.store.inspect().status,'ready');
});
test('new scope or source authority requires a new enrollment identity',async t=>{
 const f=await storeFixture(t),g=await f.enroll(),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');
 for(const patch of [{sourceId:'global:other'},{scopes:['write']},{issuer:'https://other.example/'}])await assert.rejects(f.store.commitGrant({...g,binding:normalizeAuthBinding({...g.binding,...patch,bindingRevision:undefined})},{expectedGeneration:f.store.inspect().generation}));
 const tx=await f.store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:0});await assert.rejects(f.store.completeRefresh(tx.transactionId,{...f.rotatedTokens,scopes:['write']}));assert.equal(f.store.get(f.authSource).phase,'refresh-in-flight');
});
test('grant commits reject tokens outside the bound scope set',async t=>{
 const f=await storeFixture(t);await assert.rejects(f.enroll({tokens:{...f.grant().tokens,scopes:['write']}}));assert.equal(f.store.get(f.authSource),null);
});
test('changed configuration blocks credential reuse but exposes only owned orphan binding metadata for Forget',async t=>{
 const f=await storeFixture(t),g=await f.enroll(),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');
 await f.enroll({binding:normalizeAuthBinding({...g.binding,sourceId:'global:other',grantId:'other',bindingRevision:undefined})});
 const {authSourceIdentity}=await import('../src/runtime/discovery-auth-identity.mjs');assert.equal(f.store.get({...f.authSource,authSourceIdentity:authSourceIdentity({...sourceInput,nativeProfilePath:'C:/fixture/other-profile'})}),null);
 const list=f.store.listBindings('global:fixture');assert.equal(list.length,1);assert.deepEqual(Object.keys(list[0]).sort(),['binding','phase']);assert.equal(list[0].binding.bindingRevision,g.binding.bindingRevision);assert.equal(list[0].phase,'ready');assert.doesNotMatch(JSON.stringify(list),/secret-access|secret-refresh|clientId|metadata|registration\"|expiresAt/);
 list[0].binding.scopes.push('tampered');list[0].binding.sourceId='global:other';assert.deepEqual(f.store.get(f.authSource).binding.scopes,['read']);assert.equal(f.store.listBindings('global:fixture')[0].binding.sourceId,'global:fixture');
 for(const bad of ['project:fixture','global:','global:fixture/other',{},null])assert.throws(()=>f.store.listBindings(bad));
});
test('symbolic directory provenance and explicit unprotected backend fail closed',async t=>{
 const f=await storeFixture(t);await f.enroll();const before=await fs.readFile(f.file),{createDiscoveryOAuthStore}=await import('../electron/discovery-oauth-store.mjs');
 const link=path.join(f.dataDir,'linked-profile');await fs.symlink(f.dataDir,link,'junction');
 const linked=await createDiscoveryOAuthStore({dataDir:link,protection:f.protection});assert.equal(linked.inspect().status,'unavailable');await assert.rejects(linked.commitGrant(f.grant(),{expectedGeneration:0}));await linked.close();await fs.unlink(link);assert.deepEqual(await fs.readFile(f.file),before);
 f.protection.backend=async()=>'basic_text';await f.reopen();assert.equal(f.store.inspect().status,'unavailable');assert.deepEqual(await fs.readFile(f.file),before);
});
test('nonregular hardlinked and substituted files block without touching target bytes',async t=>{
 const f=await storeFixture(t),g=await f.enroll(),before=await fs.readFile(f.file),target=path.join(f.dataDir,'retained-target.bin');await fs.writeFile(target,before);
 await fs.unlink(f.file);await fs.link(target,f.file);await f.reopen();assert.equal(f.store.inspect().status,'unavailable');await assert.rejects(f.enroll());assert.deepEqual(await fs.readFile(target),before);
 await fs.unlink(f.file);await fs.mkdir(f.file);await f.reopen();assert.equal(f.store.inspect().status,'unavailable');await assert.rejects(f.enroll());assert.equal((await fs.stat(f.file)).isDirectory(),true);
 await fs.rmdir(f.file);await fs.writeFile(f.file,before);await f.reopen();
 const original=f.fsAdapter.open;let swapped=false;
 f.fsAdapter.open=async(name,...args)=>{if(name===f.file&&!swapped){swapped=true;await fs.rename(f.file,path.join(f.dataDir,'old.bin'));await fs.writeFile(f.file,before);}return original(name,...args);};
 await assert.rejects(f.store.forget(g.binding.bindingRevision,{expectedGeneration:f.store.inspect().generation}));assert.deepEqual(await fs.readFile(f.file),before);
});
test('exact grant depth and byte boundaries are enforced before encryption',async t=>{
 const f=await storeFixture(t),base=f.grant();const commit=g=>f.store.commitGrant(g,{expectedGeneration:f.store.inspect().generation});
 const sized=bytes=>{const g={...base,metadata:{padding:''}};g.metadata.padding='x'.repeat(bytes-Buffer.byteLength(JSON.stringify(g)));return g;};
 await commit(sized(65536));await assert.rejects(commit(sized(65537)),/limit/i);
 let nested='leaf';for(let i=0;i<12;i++)nested={nested};await commit({...base,metadata:{nested}});nested={nested};await assert.rejects(commit({...base,metadata:{nested}}),/limit/i);
 await assert.rejects(commit({...base,tokens:{...base.tokens,accessToken:'é'.repeat(8193)}}));await assert.rejects(commit({...base,registration:{...base.registration,clientId:'é'.repeat(8193)}}));
});
test('exact plaintext and ciphertext envelope limits preserve bytes on overflow',async t=>{
 const f=await storeFixture(t),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');
 const grants=Array.from({length:20},(_,i)=>f.grant({binding:normalizeAuthBinding({...f.grant().binding,grantId:`envelope-${i}`,sourceId:`global:envelope-${i}`,bindingRevision:undefined}),metadata:{padding:'x'.repeat(50000)}}));
 const envelope={version:1,generation:7,grants};const missing=1048576-Buffer.byteLength(JSON.stringify(envelope));for(let i=0;i<missing;i++)grants[i%grants.length].metadata.padding+='x';assert.equal(Buffer.byteLength(JSON.stringify(envelope)),1048576);
 // A deterministic framed adapter lets us test plaintext independently of cipher overhead.
 const original=f.protection.decrypt;f.protection.decrypt=async b=>b.toString()==='fixture-envelope'?{result:JSON.stringify(envelope),shouldReEncrypt:false}:original(b);
 await fs.writeFile(f.file,'fixture-envelope');await f.reopen();assert.equal(f.store.inspect().status,'ready');const before=await fs.readFile(f.file);
 const modified={...grants[1],metadata:{padding:grants[1].metadata.padding+'x'}};await assert.rejects(f.store.commitGrant(modified,{expectedGeneration:7}),/limit/i);assert.deepEqual(await fs.readFile(f.file),before);
 envelope.grants[1]=modified;await f.reopen();assert.equal(f.store.inspect().status,'unavailable');assert.deepEqual(await fs.readFile(f.file),before);
 // Ciphertext size is independently bounded even for a small valid plaintext.
 f.protection.decrypt=original;await fs.unlink(f.file);await f.reopen();f.protection.encrypt=async()=>Buffer.alloc(1048576);await f.enroll();assert.equal((await fs.stat(f.file)).size,1048576);
 f.protection.encrypt=async()=>Buffer.alloc(1048577);await assert.rejects(f.enroll(),/limit/i);assert.equal((await fs.stat(f.file)).size,1048576);
});
test('forget and explicit reauthorization preserve other enrollments and reject stale transactions',async t=>{
 const f=await storeFixture(t),g=await f.enroll(),{normalizeAuthBinding}=await import('../src/runtime/discovery-auth-identity.mjs');const other=await f.enroll({binding:normalizeAuthBinding({...g.binding,grantId:'preserved-other',sourceId:'global:other',bindingRevision:undefined})});
 const tx=await f.store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:0});await f.store.requireReauthorization(tx.transactionId,'invalid-grant');assert.equal(f.store.get(f.authSource).phase,'reauthorization-required');assert.equal(f.store.get(f.authSource).tokens.refreshToken,undefined);
 await assert.rejects(f.store.completeRefresh(tx.transactionId,f.rotatedTokens));await f.store.forget(g.binding.bindingRevision,{expectedGeneration:f.store.inspect().generation});assert.equal(f.store.get(f.authSource),null);await f.reopen();assert.equal(f.store.get(f.authSource),null);assert.equal(f.store.get(other.binding).binding.grantId,'preserved-other');
});
