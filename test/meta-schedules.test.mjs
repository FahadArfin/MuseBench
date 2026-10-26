import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSchedules,readMetaSchedules,activateMetaSchedule} from '../electron/meta-schedules.mjs';
import {validatePersonalCommand} from '../electron/personal-policy.mjs';

test('schedule identities are bounded, stable and ambiguous duplicates are not actionable',()=>{
 const rows=[{title:'A',timing:'Tomorrow'},{title:'A',timing:'Tomorrow'},{title:'B',timing:'Daily'}];
 const result=normalizeSchedules(rows);assert.equal(result.length,2);assert.equal(result[0].ambiguous,true);assert.equal(result[1].ambiguous,false);
 assert.equal(result[1].id,normalizeSchedules(rows.slice().reverse())[0].id);
 assert.deepEqual(normalizeSchedules([{title:'x'.repeat(241),timing:'Daily'},{title:'A',timing:null}]),[]);
});
test('schedule bridge accepts only opaque IDs and fixed actions',()=>{
 for(const action of ['edit','options'])assert.doesNotThrow(()=>validatePersonalCommand({type:'scheduleAction',action,id:'a'.repeat(24)}));
 assert.doesNotThrow(()=>validatePersonalCommand({type:'scheduleAction',action:'new'}));
 for(const request of [{action:'delete'}, {action:'pause'}, {action:'edit',id:'https://example.com'}, {action:'options',id:'a'.repeat(24),script:'x'}])assert.throws(()=>validatePersonalCommand({type:'scheduleAction',...request}));
});
test('schedule adapter refuses other origins, routes, destroyed views and stale duplicates',async()=>{
 for(const url of ['https://muse.ai/scheduled','https://www.meta.ai/','https://www.meta.ai.evil.com/scheduled','https://user@www.meta.ai/scheduled']){
  const contents={getURL:()=>url,isDestroyed:()=>false,executeJavaScript(){assert.fail('wrong document');}};
  assert.equal(await readMetaSchedules(contents),null);assert.equal(await activateMetaSchedule(contents,{},'edit'),false);
 }
 const contents={getURL:()=>'https://www.meta.ai/scheduled',isDestroyed:()=>false,executeJavaScript(){assert.fail('ambiguous row');}};
 assert.equal(await activateMetaSchedule(contents,{ambiguous:true},'edit'),false);
});
