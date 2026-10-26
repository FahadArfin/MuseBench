import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandInfo,normalizeSkills,usageSummary,exportTranscript} from '../electron/command-info.mjs';
test('skill discovery returns bounded text metadata, excludes disabled skills and rejects malformed IDs',()=>{
 const data={skills:[{id:'bundled:testing',name:'testing',display_name:'Testing',description:'Check behavior',scope:'bundled',activation:'on'},{id:'off',activation:'off'},{id:'bad\ncommand',activation:'on'}]};
 assert.deepEqual(normalizeSkills(data),[{id:'bundled:testing',name:'testing',title:'Testing',description:'Check behavior',scope:'Bundled'}]);
});
test('command info uses fixed read-only argv without a shell or workspace trust',async()=>{
 const calls=[];const service=createCommandInfo({getState:()=>({runtime:{binary:'C:\\Muse\\muse.exe'},activeProject:{root:'C:\\Project'}}),run:async(binary,args,options)=>{calls.push({binary,args,options});return{stdout:'{"skills":[]}'};}});
 assert.deepEqual((await service('skills')).skills,[]);assert.deepEqual(calls[0].args,['skills','list','--enabled-only','--json','--workspace','C:\\Project']);
 assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.windowsHide,true);
 await assert.rejects(()=>service('exec'));assert.equal(calls.length,1);
});
test('usage failures never return credential/error payloads and usage summaries exclude account identifiers',async()=>{
 const service=createCommandInfo({getState:()=>({runtime:{binary:'C:\\Muse\\muse.exe'}}),run:async()=>{throw Error('secret-token credential_rejected');}});
 const result=await service('usage');assert.equal(result.status,'unavailable');assert(!JSON.stringify(result).includes('secret-token'));
 const summary=usageSummary({email:'private@example.org',api_key:'private',usage:{used_percent:12,remaining:88},token:'hidden'});
 assert(summary.some(row=>row.value==='12'));assert(!JSON.stringify(summary).includes('private'));assert(!JSON.stringify(summary).includes('hidden'));
});
test('export includes visible chat history without runtime internals or credentials',()=>{
 const result=exportTranscript({task:{title:'Parser',request:'Explain it',messages:[{role:'system',text:'internal'},{role:'user',text:'Explain it'},{role:'assistant',text:'It parses input.'}]}});
 assert.match(result,/It parses input/);assert(!result.includes('internal'));assert.equal(result.match(/Explain it/g).length,1);
});
