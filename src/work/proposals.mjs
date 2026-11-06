import {randomUUID} from 'node:crypto';
import {validateWorkDocument} from '../shared/work-documents.mjs';
import {createWorkProposalPrompt,validateWorkSelection,workProposalSurfaces} from '../shared/work-prompts.mjs';
import {validateStoryboard} from '../shared/work-storyboards.mjs';
const clone=value=>structuredClone(value);
const error=(code,message)=>Object.assign(Error(message),{code});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const terminal=new Set(['applied','discarded','cancelled','failed']);
const MAX_RESULT_BYTES=16*1024*1024;
const snapshot=value=>validateWorkDocument(value?.document??value);
function parse(value){if(typeof value==='string'){if(Buffer.byteLength(value)>MAX_RESULT_BYTES)throw error('INVALID_PROPOSAL','The Muse proposal exceeds the size limit.');try{return JSON.parse(value);}catch{throw error('INVALID_PROPOSAL','Muse did not write a valid JSON proposal.');}}if(!value||Buffer.byteLength(JSON.stringify(value))>MAX_RESULT_BYTES)throw error('INVALID_PROPOSAL','The Muse proposal is missing or too large.');return value;}
/** Validate and preview data only. Nothing is committed until apply(). */
export function validateWorkProposal(input,{document,proposalId,selection}){
 const value=parse(input);
 if(!exact(value,['version','proposalId','itemId','baseRevision','summary','operations'])||value.version!==1||value.proposalId!==proposalId||value.itemId!==document.id||value.baseRevision!==document.revision)throw error('INVALID_PROPOSAL','Muse proposal identity or base revision does not match its request.');
 if(typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>2000||!Array.isArray(value.operations)||!value.operations.length||value.operations.length>100)throw error('INVALID_PROPOSAL','Muse proposal needs a bounded summary and 1 to 100 supported edits.');
 const next=clone(document),changes=[];let replaced=false;const targets=new Set();
 const allowed=(surfaceId,id)=>selection.scope==='project'||selection.surfaceId===surfaceId&&(selection.scope==='surface'||selection.nodeIds.includes(id));
 for(const op of value.operations){
  if(!op||typeof op!=='object')throw error('INVALID_PROPOSAL','Unsupported Muse operation.');
  if(op.type==='replaceData'){
   if(!exact(op,['type','data'])||selection.scope!=='project'||value.operations.length!==1)throw error('OUT_OF_SCOPE','Whole-project data replacement requires project scope and must be the sole edit.');
   next.data=clone(op.data);replaced=true;changes.push({type:op.type,targetId:document.id,label:'Replace project content'});continue;
  }
  let target,replacement,index,collection,surfaceId;
  if(op.type==='updateNode'){
   if(!exact(op,['type','surfaceId','nodeId','node'])||!['design','image','slides','motion'].includes(document.kind))throw error('INVALID_PROPOSAL','Unsupported scene edit.');
   const surface=workProposalSurfaces(next).find(s=>s.id===op.surfaceId);collection=surface?.nodes;surfaceId=op.surfaceId;target=op.nodeId;replacement=op.node;
  }else if(op.type==='updateBlock'){
   if(!exact(op,['type','blockId','block'])||document.kind!=='document')throw error('INVALID_PROPOSAL','Unsupported document edit.');
   collection=next.data.blocks;surfaceId='document';target=op.blockId;replacement=op.block;
  }else if(op.type==='updateClip'){
   if(!exact(op,['type','trackId','clipId','clip'])||document.kind!=='video')throw error('INVALID_PROPOSAL','Unsupported video edit.');
   collection=next.data.tracks.find(t=>t.id===op.trackId)?.clips;surfaceId=op.trackId;target=op.clipId;replacement=op.clip;
  }else if(op.type==='updateStoryboardScene'){
   if(!exact(op,['type','sceneId','scene'])||document.kind!=='video')throw error('INVALID_PROPOSAL','Unsupported storyboard edit.');
   collection=next.data.storyboard;surfaceId='storyboard';target=op.sceneId;replacement=op.scene;
  }else throw error('INVALID_PROPOSAL','Muse proposed an unsupported operation.');
  index=collection?.findIndex(n=>n.id===target)??-1;
  if(index<0||!allowed(surfaceId,target))throw error('OUT_OF_SCOPE','Muse proposed an edit outside the declared selection.');
  if(!replacement||replacement.id!==target)throw error('INVALID_PROPOSAL','Muse edits must preserve target IDs.');
  if(targets.has(target))throw error('INVALID_PROPOSAL','A proposal cannot replace the same target twice.');targets.add(target);
  const original=workProposalSurfaces(document).find(s=>s.id===surfaceId),before=(original?.nodes??original?.blocks??original?.clips??original?.storyboard)?.find(n=>n.id===target);
  collection[index]=clone(replacement);if(op.type==='updateStoryboardScene')next.data.storyboard=validateStoryboard(collection);
  changes.push({type:op.type,surfaceId,targetId:target,label:`Update ${op.type==='updateBlock'?'block':op.type==='updateClip'?'clip':op.type==='updateStoryboardScene'?'storyboard scene':'object'} ${target}`,before:clone(before),after:clone(replacement)});
 }
 const preview=validateWorkDocument(next);
 return{summary:value.summary.trim(),operations:clone(value.operations),changes,preview,replaced};
}
/** Runtime and filesystem ownership remain injected by the existing Work controller. */
export function createWorkProposalService({readDocument,commitEdit,request,readResult,getSourceContext,stop:stopRuntime,now=()=>new Date().toISOString(),maxProposals=20}={}){
 if(![readDocument,commitEdit,request,readResult].every(fn=>typeof fn==='function'))throw error('INVALID_CONFIGURATION','Proposal service requires the existing Work document and Muse runtime adapters.');
 const records=new Map(),bases=new Map();
 const publish=record=>clone({...Object.fromEntries(Object.entries(record).filter(([key])=>!['preview','requestPending'].includes(key))),...(['ready','conflict'].includes(record.status)&&record.preview?{previewDocument:record.preview}:{})});
 const find=({itemId,proposalId})=>{const p=records.get(proposalId);if(!p||p.itemId!==itemId)throw error('PROPOSAL_NOT_FOUND','This proposal does not belong to the requested Work item.');return p;};
 const failRecord=(p,e)=>{p.status='failed';p.error={code:e.code??'MUSE_REQUEST_FAILED',message:String(e.message??e).slice(0,2000)};p.updatedAt=now();};
 async function start({itemId,revision,selection:rawSelection,instruction,sourceIds}){
  if(sourceIds!==undefined&&(!Array.isArray(sourceIds)||sourceIds.length>8||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>typeof id!=='string'||!id||id.length>128)))throw error('INVALID_SOURCES','Choose up to eight unique attached source IDs.');
  const document=snapshot(await readDocument(itemId));if(document.id!==itemId||document.revision!==revision)throw error('REVISION_CONFLICT','The project revision changed before the Muse request.');
  if([...records.values()].some(p=>p.itemId===itemId&&['pending','applying'].includes(p.status)))throw error('PROPOSAL_BUSY','This project already has a pending Muse proposal.');
  const id=randomUUID(),selection=validateWorkSelection(document,rawSelection),sourceContext=getSourceContext?await getSourceContext({itemId,sourceIds}):undefined;
  if(sourceIds?.length&&!getSourceContext)throw error('SOURCES_UNAVAILABLE','Attached sources are unavailable in this session.');
  if(sourceIds&&sourceContext?.sources?.some(source=>!sourceIds.includes(source.id)))throw error('INVALID_SOURCES','The source reader returned an unselected source.');
  const {prompt,filename}=createWorkProposalPrompt({document,proposalId:id,selection,instruction,sourceContext});
  if([...records.values()].some(p=>p.itemId===itemId&&['pending','applying'].includes(p.status)))throw error('PROPOSAL_BUSY','This project already has a pending Muse proposal.');
  if(records.size>=maxProposals){const old=[...records.values()].find(p=>terminal.has(p.status));if(!old)throw error('PROPOSAL_LIMIT','Review or discard an existing Muse proposal first.');records.delete(old.id);bases.delete(old.id);}
  const p={id,proposalId:id,itemId,baseRevision:revision,selection,instruction:instruction.trim(),...(sourceContext?{sourceIds:sourceContext.sources.map(s=>s.id)}:{}),filename,status:'pending',summary:'Waiting for a structured Muse proposal.',changes:[],createdAt:now(),updatedAt:now(),requestPending:true};
  records.set(id,p);bases.set(id,document);
  try{Promise.resolve(request({itemId,prompt,displayText:instruction.trim()})).then(()=>{p.requestPending=false;}).catch(e=>{p.requestPending=false;if(p.status==='pending')failRecord(p,e);});}catch(e){p.requestPending=false;failRecord(p,e);}
  return publish(p);
 }
 async function poll(args){
  const p=find(args);if(p.status!=='pending'||p.requestPending)return publish(p);
  try{
   const value=await readResult({itemId:p.itemId,proposalId:p.id,filename:p.filename});if(p.status!=='pending'||value===null||value===undefined)return publish(p);
   if(exact(value,['runtimeStatus','error'])&&['completed','failed','cancelled'].includes(value.runtimeStatus)){
    if(value.runtimeStatus==='cancelled'){p.status='cancelled';p.updatedAt=now();return publish(p);}
    throw error(value.runtimeStatus==='completed'?'MISSING_PROPOSAL':'MUSE_RUNTIME_FAILED',value.runtimeStatus==='completed'?'Muse finished without a valid structured proposal. Its chat reply did not change this project.':typeof value.error==='string'?value.error:'The Muse runtime failed before producing a proposal.');
   }
   const checked=validateWorkProposal(value,{document:bases.get(p.id),proposalId:p.id,selection:p.selection});
   const current=snapshot(await readDocument(p.itemId));if(p.status!=='pending')return publish(p);
   Object.assign(p,checked,{status:current.revision===p.baseRevision?'ready':'conflict',updatedAt:now()});
   if(p.status==='conflict')p.error={code:'REVISION_CONFLICT',message:'The project changed while Muse was preparing this proposal. Regenerate from the current revision.'};
  }catch(e){if(p.status==='pending')failRecord(p,e);}
  return publish(p);
 }
 async function apply(args){
  const p=find(args);
  if(p.status!=='ready')throw error(p.status==='conflict'?'REVISION_CONFLICT':'PROPOSAL_NOT_READY',p.status==='conflict'?'This proposal conflicts with a newer project revision. Regenerate it first.':'This proposal is not ready to apply. Review its status first.');
  if(args.expectedRevision!==p.baseRevision){p.status='conflict';throw error('REVISION_CONFLICT','The proposal is based on an older project revision.');}
  const current=snapshot(await readDocument(p.itemId));if(p.status!=='ready')throw error('PROPOSAL_BUSY','The proposal is already being applied or was discarded.');if(current.revision!==p.baseRevision){p.status='conflict';throw error('REVISION_CONFLICT','The project changed after this proposal was prepared.');}
  // Revalidate immediately before the atomic expected-revision commit.
  const checked=validateWorkProposal({version:1,proposalId:p.id,itemId:p.itemId,baseRevision:p.baseRevision,summary:p.summary,operations:p.operations},{document:current,proposalId:p.id,selection:p.selection});
  p.status='applying';
  try{const result=await commitEdit({itemId:p.itemId,expectedRevision:p.baseRevision,operations:[{type:'replaceData',data:checked.preview.data}],origin:'muse'});p.status='applied';p.updatedAt=now();return{...result,proposal:publish(p)};}catch(e){p.status=e.code==='REVISION_CONFLICT'?'conflict':'ready';p.error={code:e.code??'SAVE_FAILED',message:String(e.message??e).slice(0,2000)};throw e;}
 }
 async function cancel(args,status){const p=find(args);if(p.status==='applying')throw error('PROPOSAL_BUSY','The proposal is currently being committed.');if(terminal.has(p.status))return publish(p);const pending=p.status==='pending';p.status=status;p.updatedAt=now();if(pending&&stopRuntime){try{await stopRuntime({itemId:p.itemId,proposalId:p.id});}catch(e){p.error={code:'STOP_FAILED',message:String(e.message??e).slice(0,2000)};}}return publish(p);}
 return{start,poll,apply,discard:args=>cancel(args,'discarded'),stop:args=>cancel(args,'cancelled'),list:async({itemId}={})=>[...records.values()].filter(p=>!itemId||p.itemId===itemId).map(publish)};
}
