import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {restoreNativeSession} from '../../src/shared/native-session.mjs';

export const sourceInput={sourceId:'global:fixture',transport:'streamable-http',globalSettingsPath:'C:/fixture/profile/settings.json',nativeProfilePath:'C:/fixture/profile',urlTemplate:'https://resource.example/${KEY}',resolvedUrl:'https://resource.example/private-fixture',headerTemplates:{'X-Key':'${KEY}'},resolvedHeaders:{'X-Key':'private-fixture'},authPolicy:{version:1,mode:'public-native-bearer'}};
export function fakeProtection(){
 const key=randomBytes(32);return{available:async()=>true,encrypt:async text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(text,'utf8'),c.final(),c.getAuthTag()]);},decrypt:async bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(-16));return{result:Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]).toString('utf8'),shouldReEncrypt:false};}};
}
export async function storeFixture(t){
 const {createDiscoveryOAuthStore}=await import('../../electron/discovery-oauth-store.mjs');
 const {authSourceIdentity,normalizeAuthBinding}=await import('../../src/runtime/discovery-auth-identity.mjs');
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'musebench-oauth-unit-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
 const protection=fakeProtection(),faults={rename:false},fsAdapter={...fs,rename:async(...args)=>{if(faults.rename)throw Error('fixture write failure');return fs.rename(...args);}};
 const f={dataDir,file:path.join(dataDir,'discovery-oauth.bin'),protection,fsAdapter,faults,networkRequests:0,store:null,authSource:{sourceId:'global:fixture',authSourceIdentity:authSourceIdentity(sourceInput)},rotatedTokens:{accessToken:'secret-access-rotated',refreshToken:'secret-refresh-rotated',expiresAt:200000}};
 f.grant=(overrides={})=>({binding:normalizeAuthBinding({grantId:'enrollment-fixture',...f.authSource,endpoint:sourceInput.resolvedUrl,issuer:'https://issuer.example/',resource:'https://resource.example/',registrationId:'registration-fixture',scopes:['read']}),registration:{clientId:'fixture-public-client',callbackPort:43123,callbackUri:'http://127.0.0.1:43123/oauth/mcp/callback',method:'dcr'},metadata:{issuer:'https://issuer.example/',token_endpoint:'https://issuer.example/token'},destinations:['https://issuer.example'],tokens:{accessToken:'secret-access-initial',refreshToken:'secret-refresh-initial',expiresAt:100000},tokenGeneration:0,phase:'ready',...overrides});
 f.reopen=async()=>{await f.store?.close();f.store=await createDiscoveryOAuthStore({dataDir,protection,fsAdapter});return f.store;};
 f.enroll=async(overrides={})=>f.store.commitGrant(f.grant(overrides),{expectedGeneration:f.store.inspect().generation});
 f.restore=g=>restoreNativeSession({id:'fixture-native-session',root:'C:/fixture/project',transport:'msp',status:'ready',toolDiscovery:{sources:[{id:g.binding.sourceId,revision:'a'.repeat(64),authBindingRevision:g.binding.bindingRevision}]}});
 await f.reopen();t.after(()=>f.store.close());return f;
}
