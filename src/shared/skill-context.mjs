const clean=(value,max=350)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const diagnostics=value=>(Array.isArray(value)?value:[]).slice(0,20).map(item=>clean(typeof item==='string'?item:item?.message||item?.code)).filter(Boolean);
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9][\w:./-]{0,199}$/.test(value)&&!value.includes('..');

/** CLI observations only. Never read skill bodies or infer a runtime token bill. */
export function normalizeSkillCatalog(value){
 if(!Array.isArray(value?.skills))throw Error('Muse returned an invalid skill catalog.');
 const seen=new Set(),skills=[];
 for(const item of value.skills){
  if(!item||!validId(item.id)||seen.has(item.id)||skills.length>=500)continue;
  seen.add(item.id);
  const cost=item.context_cost;
  skills.push({id:item.id,title:clean(item.display_name||item.name||item.id,200),description:clean(item.short_description||item.description,800),scope:clean(item.scope,30),activation:item.activation==='user-invocable-only'?'user-only':['on','off','user-only'].includes(item.activation)?item.activation:'off',
   contextCost:{startupBytes:count(cost?.startup_bytes),startupTokens:count(cost?.startup_estimated_tokens),invokeBytes:count(cost?.invoke_bytes),invokeTokens:count(cost?.invoke_estimated_tokens)},diagnostics:diagnostics(item.diagnostics)});
 }
 return{skills,skillCatalog:{diagnostics:diagnostics(value.diagnostics),omitted:value.skills.length-skills.length}};
}

export function summarizeSkillContext(skills=[],catalog){
 let startupTokens=0,known=0,overflow=false;
 for(const skill of skills){
  const value=count(skill.contextCost?.startupTokens);
  if(value===null)continue;
  known++;startupTokens+=value;if(!Number.isSafeInteger(startupTokens))overflow=true;
 }
 const omitted=count(catalog?.omitted)??0,unknown=skills.length-known;
 return{count:skills.length,enabled:skills.filter(s=>s.activation==='on').length,manual:skills.filter(s=>s.activation==='user-only').length,disabled:skills.filter(s=>s.activation==='off').length,
  startupTokens:overflow||(!known&&(skills.length>0||!catalog||omitted>0))?null:startupTokens,known,unknown,omitted,partial:!catalog||unknown>0||omitted>0||overflow,
  diagnosticCount:(catalog?.diagnostics?.length??0)+skills.reduce((n,s)=>n+(s.diagnostics?.length??0),0)};
}
