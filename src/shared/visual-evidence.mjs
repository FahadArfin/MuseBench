import {imageReferences} from './code-images.mjs';
export function restoreVisualEvidence(value){
 if(!Array.isArray(value))return[];
 return value.slice(-12).flatMap(row=>{
  if(!row||typeof row.id!=='string'||!/^visual:[a-zA-Z0-9-]{1,100}$/.test(row.id)||row.kind!=='tool'||row.status!=='completed'||!['view','capture'].includes(row.visual?.kind)||typeof row.visual.projectId!=='string'||!row.visual.projectId||row.visual.projectId.length>200)return[];
  let images;try{images=imageReferences(row.images);if(images.length!==1)return[];}catch{return[];}
  const kind=row.visual.kind;
  return[{id:row.id,kind:'tool',status:'completed',tool:kind==='view'?'visual_view':'visual_capture',title:kind==='view'?'Viewed an image':'Captured a screenshot',detail:'Preview of the inspected image.',output:'',subject:typeof row.subject==='string'?row.subject.slice(0,1000):'',images,visual:{projectId:row.visual.projectId,kind}}];
 });
}
