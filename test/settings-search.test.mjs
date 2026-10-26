import test from 'node:test';
import assert from 'node:assert/strict';
import {SETTINGS_CATEGORIES,findSettings} from '../src/ui/settings-catalog.mjs';
test('settings search matches controls and synonyms across groups, and has a real empty state',()=>{
 assert.deepEqual(findSettings(''),SETTINGS_CATEGORIES);
 assert(findSettings('permission').some(x=>x.id==='code'));
 assert(findSettings('microphone').some(x=>x.id==='voice'));
 assert(findSettings('  TEXT SIZE ').some(x=>x.id==='general'));
 assert(findSettings('download transcript').some(x=>x.id==='data'));
 assert.deepEqual(findSettings('nonexistent-feature'),[]);
 assert.equal(new Set(SETTINGS_CATEGORIES.map(x=>x.id)).size,SETTINGS_CATEGORIES.length);
});
test('search finds exact visible control labels and suggested queries',()=>{
 for(const [query,id] of [['Enter to send','general'],['Reduce motion','general'],['Task completions','notifications'],['Needs attention','notifications'],['Your instructions','memory'],['approvals','code'],['Recognition language','voice'],['Export current Code chat','data']])assert(findSettings(query).some(item=>item.id===id),query);
});
