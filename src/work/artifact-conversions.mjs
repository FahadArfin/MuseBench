import {randomUUID} from 'node:crypto';
import {validateArtifact} from '../shared/work-artifacts.mjs';
import {validateWorkDocument} from '../shared/work-documents.mjs';
import {createDocumentData} from '../shared/work-document-blocks.mjs';

/** Existing Sites/Spaces viewer supports v1 artifacts only. Never pass an item,
 * workspace, attached source file or chat object to either external copy API. */
export function createWorkArtifactSnapshot(input){
 if(input?.version!==1)throw Error('Creative projects remain private and exportable. Sharing requires a supported snapshot viewer.');
 return validateArtifact(input);
}

/** Explicit selected-content copy. Never mutates or re-links the source item. */
export function convertArtifactSelection({artifact:input,selection,targetKind,sourceItemId,sourceRevision=0,id=randomUUID(),now=new Date().toISOString()}={}){
 const artifact=validateArtifact(input);
 if(artifact.kind!=='dashboard')throw Error('Selected chart/table conversion requires a dashboard.');
 if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(key=>!(selection.type==='chart'?['type','index']:['type']).includes(key)))throw Error('Unsupported chart/table selection fields.');
 if(sourceItemId!==undefined&&(typeof sourceItemId!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(sourceItemId)))throw Error('Source item must be a managed item ID.');
 if(!Number.isSafeInteger(sourceRevision)||sourceRevision<0)throw Error('Source revision must be a nonnegative integer.');
 if(!['design','slides','document'].includes(targetKind))throw Error('Unsupported editable conversion target.');
 let content,title,provenance;
 if(selection?.type==='chart'&&Number.isSafeInteger(selection.index)&&selection.index>=0&&selection.index<artifact.charts.length){
  const chart=artifact.charts[selection.index];title=chart.title;content={type:'chart',chart:{type:chart.type,labels:[...chart.labels],values:[...chart.values],title:chart.title}};
  provenance=[chart.source?`Source: ${chart.source}`:'',chart.calculation?`Calculation: ${chart.calculation}`:'',chart.unit?`Unit: ${chart.unit}`:''].filter(Boolean);
 }else if(selection?.type==='table'&&artifact.table){title=`${artifact.title} — data`;content={type:'table',table:structuredClone(artifact.table)};provenance=[];}
 else throw Error('Selected chart/table does not exist.');
 provenance.push(...artifact.sources.map(source=>`${source.name}: ${source.detail}`));
 const reference=`Copied from dashboard “${artifact.title}”${sourceItemId?` (${sourceItemId}, revision ${sourceRevision})`:''}. Values are an independent snapshot.`;
 const attribution=[reference,...provenance].join('\n');
 const base={version:2,id,kind:targetKind,title,revision:0,createdAt:now,updatedAt:now,assets:[]};
 if(targetKind==='document'){
  const block=content.type==='table'?{id:randomUUID(),type:'table',columns:content.table.columns,rows:content.table.rows.map(row=>row.map(String))}:{...content,id:randomUUID()};
  return validateWorkDocument({...base,data:{...createDocumentData(),blocks:[{id:randomUUID(),type:'heading',level:1,runs:[{text:title}]},block,{id:randomUUID(),type:'paragraph',runs:[{text:attribution}]}]}});
 }
 const node=(type,x,y,width,height,extra)=>({id:randomUUID(),type,x,y,width,height,rotation:0,opacity:1,locked:false,hidden:false,...extra});
 const nodes=[node('text',64,40,1152,64,{text:title,style:{fontSize:32,color:'#152238'}}),node(content.type,64,132,1152,400,content),node('text',64,560,1152,112,{text:attribution,style:{fontSize:14,color:'#43516a'}})];
 const surfaceId=randomUUID();
 return validateWorkDocument({...base,data:targetKind==='slides'?{width:1280,height:720,slides:[{id:surfaceId,name:title,background:'#ffffff',nodes,notes:attribution}]}:{artboards:[{id:surfaceId,name:title,width:1280,height:720,background:'#ffffff',nodes}],activeArtboardId:surfaceId}});
}
