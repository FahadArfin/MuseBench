import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAgentProfile,readAgentProfile} from '../electron/personal-agent.mjs';
test('agent identity uses Muse by default and retains bounded custom names',()=>{
 assert.deepEqual(normalizeAgentProfile(null),{name:'Muse',avatar:null});assert.equal(normalizeAgentProfile({name:'  jarvis\n  '}).name,'jarvis');assert.equal(normalizeAgentProfile({name:'X'.repeat(100)}).name.length,80);
 for(const avatar of ['https://example.com/avatar.png','blob:https://muse.ai/test','data:image/svg+xml,<svg onload="bad"/>','data:image/png;base64,'+'A'.repeat(60000)])assert.equal(normalizeAgentProfile({avatar}).avatar,null);
 assert.equal(normalizeAgentProfile({avatar:'data:image/png;base64,aGVsbG8='}).avatar,'data:image/png;base64,aGVsbG8=');
});
test('agent profile reads are restricted to the signed-in Muse origin',async()=>{
 for(const url of ['https://www.meta.ai/','https://auth.muse.ai/','https://muse.ai.evil.com/','https://user:pass@muse.ai/'])assert.equal(await readAgentProfile({isDestroyed:()=>false,getURL:()=>url,executeJavaScript(){assert.fail('must not read');}}),null);
 assert.equal(await readAgentProfile({isDestroyed:()=>true}),null);
 const contents={isDestroyed:()=>false,getURL:()=>'https://muse.ai/',executeJavaScript:async()=>({name:'jarvis',avatar:'https://untrusted.example/pic'})};assert.deepEqual(await readAgentProfile(contents),{name:'jarvis',avatar:null});
 contents.executeJavaScript=async()=>null;assert.equal(await readAgentProfile(contents),null);
});
