import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/shared/skill-context.mjs').catch(()=>({}));
const skill=(id,extra={})=>({id,name:id,scope:'bundled',activation:'on',...extra});

test('native skill costs and diagnostics survive without guessing missing invocation costs',()=>{
 const result=api.normalizeSkillCatalog({skills:[skill('bundled:plan',{context_cost:{startup_bytes:950,startup_estimated_tokens:238,invoke_bytes:null,invoke_estimated_tokens:null},diagnostics:[{code:'warning',message:'Check\nfront matter'}]})],diagnostics:[{code:'project-skills-untrusted'}]});
 assert.deepEqual(result.skills[0].contextCost,{startupBytes:950,startupTokens:238,invokeBytes:null,invokeTokens:null});
 assert.deepEqual(result.skills[0].diagnostics,['Check front matter']);
 assert.deepEqual(result.skillCatalog,{diagnostics:['project-skills-untrusted'],omitted:0});
});

test('catalog totals preserve reported values regardless of activation and mark incomplete observations',()=>{
 const {skills,skillCatalog}=api.normalizeSkillCatalog({skills:[
  skill('enabled',{context_cost:{startup_estimated_tokens:100}}),
  skill('manual',{activation:'user-invocable-only',context_cost:{startup_estimated_tokens:8}}),
  skill('disabled',{activation:'off',context_cost:{startup_estimated_tokens:0}}),
  skill('missing',{context_cost:{startup_estimated_tokens:null}}),
 ]});
 const sum=api.summarizeSkillContext(skills,skillCatalog);
 assert.equal(skills[1].activation,'user-only');
 assert.deepEqual(sum,{count:4,enabled:2,manual:1,disabled:1,startupTokens:108,known:3,unknown:1,omitted:0,partial:true,diagnosticCount:0});
 assert.equal(api.summarizeSkillContext([skills[2]],skillCatalog).startupTokens,0);
 assert.equal(api.summarizeSkillContext([skills[3]],skillCatalog).startupTokens,null);
});

test('malformed and truncated inventories never become complete zero-cost catalogs',()=>{
 for(const input of [null,{}, {skills:'bad'}])assert.throws(()=>api.normalizeSkillCatalog(input),/catalog/i);
 const result=api.normalizeSkillCatalog({skills:[null,skill('../bad'),skill('valid'),skill('valid'),...Array.from({length:501},(_,i)=>skill(`large-${i}`))],diagnostics:Array.from({length:80},()=>({message:'a'.repeat(900)}))});
 assert.equal(result.skills.length,500);assert.equal(result.skillCatalog.omitted,5);
 assert.equal(result.skillCatalog.diagnostics.length,20);assert(result.skillCatalog.diagnostics.every(d=>d.length<=350));
 assert.equal(api.summarizeSkillContext(result.skills,result.skillCatalog).partial,true);
 assert.equal(api.summarizeSkillContext([],undefined).startupTokens,null);
});

test('invalid numeric estimates and overflowing aggregates remain unknown',()=>{
 for(const bad of [-1,Infinity,NaN,'10',1.5,Number.MAX_SAFE_INTEGER+1]){
  const {skills}=api.normalizeSkillCatalog({skills:[skill('invalid',{context_cost:{startup_estimated_tokens:bad}})]});
  assert.equal(skills[0].contextCost.startupTokens,null);
 }
 const {skills,skillCatalog}=api.normalizeSkillCatalog({skills:[skill('one',{context_cost:{startup_estimated_tokens:Number.MAX_SAFE_INTEGER}}),skill('two',{context_cost:{startup_estimated_tokens:1}})]});
 const sum=api.summarizeSkillContext(skills,skillCatalog);assert.equal(sum.startupTokens,null);assert.equal(sum.partial,true);
});
