import {createWorkDocument,validateWorkDocument} from '../shared/work-documents.mjs';
import {applyWorkOperations} from '../shared/work-operations.mjs';
import {CREATIVE_TEMPLATES,instantiateWorkTemplate} from '../shared/work-creative-catalog.mjs';
import type {WorkDocument} from '../shared/work-document-types';
import type {WorkStudioRequest} from '../shared/work-studio-types';

/** Browser preview simulation. Native import, export and provider actions are
 * deliberately unavailable; this map is not desktop persistence evidence. */
export function createPreviewWorkStudio(onDocument:(document:WorkDocument,created:boolean)=>void){
 const docs=new Map<string,WorkDocument>(),history=new Map<string,WorkDocument[]>(),names=new Map<string,Map<number,string>>(),brands:any[]=[];
 const read=(id:string)=>{const doc=docs.get(id);if(!doc)throw Error('Preview project not found.');return structuredClone(doc);};
 const result=(document:WorkDocument)=>({document:structuredClone(document),revision:document.revision,simulation:true});
 return async(input:WorkStudioRequest):Promise<any>=>{const r=input as any;
  if(r.type==='create'){const document=r.document?validateWorkDocument(r.document):createWorkDocument(r.kind,{title:r.title});docs.set(document.id,document);history.set(document.id,[document]);onDocument(document,true);return{itemId:document.id,...result(document)};}
  if(r.type==='read'){const document=r.revision===undefined?read(r.itemId):history.get(r.itemId)?.find(d=>d.revision===r.revision);if(!document)throw Error('Preview revision unavailable.');return result(document);}
  if(r.type==='commit'){const current=read(r.itemId);if(current.revision!==r.expectedRevision)throw Object.assign(Error('The preview revision changed.'),{code:'CONFLICT'});const next=applyWorkOperations(current,r.operations);next.revision++;next.updatedAt=new Date().toISOString();docs.set(r.itemId,next);history.get(r.itemId)!.push(next);onDocument(next,false);return result(next);}
  if(r.type==='versions')return{versions:(history.get(r.itemId)??[]).map(d=>({revision:d.revision,title:d.title,createdAt:d.updatedAt,current:d.revision===docs.get(r.itemId)?.revision,name:names.get(r.itemId)?.get(d.revision)}))};
  if(r.type==='checkpoint'){const doc=read(r.itemId);if(!names.has(r.itemId))names.set(r.itemId,new Map());names.get(r.itemId)!.set(doc.revision,r.name);return{revision:doc.revision,name:r.name};}
  if(r.type==='restore'){const current=read(r.itemId),old=history.get(r.itemId)?.find(d=>d.revision===r.revision);if(!old||current.revision!==r.expectedRevision)throw Error('Preview revision conflict.');const next={...structuredClone(old),revision:current.revision+1,updatedAt:new Date().toISOString()};docs.set(r.itemId,next);history.get(r.itemId)!.push(next);onDocument(next,false);return result(next);}
  if(r.type==='assets')return{assets:read(r.itemId).assets};
  if(r.type==='jobs'||r.type==='providerJobs')return{jobs:[]};
  if(r.type==='exportCapabilities')return{formats:[]};
  if(r.type==='templates'){if(!r.action||r.action==='list')return{templates:CREATIVE_TEMPLATES};if(r.action==='create'){const template=CREATIVE_TEMPLATES.find(t=>t.id===r.templateId);if(!template)throw Error('Template unavailable.');const document=validateWorkDocument(await instantiateWorkTemplate(template));docs.set(document.id,document);history.set(document.id,[document]);onDocument(document,true);return{itemId:document.id,...result(document)};}throw Error('Reusable template storage needs the desktop app.');}
  if(r.type==='brands'){if(!r.action||r.action==='list')return{kits:structuredClone(brands)};if(r.action==='save'){brands.splice(0,brands.length,...brands.filter(b=>b.id!==r.kit.id),r.kit);return r.kit;}if(r.action==='remove'){const i=brands.findIndex(b=>b.id===r.brandId);if(i>=0)brands.splice(i,1);return{removed:true};}}
  if(r.type==='providerCapabilities')return{capabilities:[]};
  if(r.type==='proposals')return{proposals:[]};
  throw Error('This action needs the MuseBench desktop app. Browser preview does not run native exports or model requests.');
 };
}
