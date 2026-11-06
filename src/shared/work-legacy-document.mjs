import {validateArtifact} from './work-artifacts.mjs';
import {createDocumentData,validateDocumentData} from './work-document-blocks.mjs';
export function convertLegacyDocumentData(value,{makeId=()=>globalThis.crypto.randomUUID()}={}){
 const artifact=validateArtifact(value),data=createDocumentData();data.blocks=[];
 const heading=(text,level=1)=>data.blocks.push({id:makeId(),type:'heading',level,runs:[{text}]});
 const paragraph=text=>{if(text)data.blocks.push({id:makeId(),type:'paragraph',runs:[{text}]});};
 heading(artifact.title);paragraph(artifact.summary);
 if(artifact.metrics.length){heading('Metrics',2);data.blocks.push({id:makeId(),type:'table',columns:['Metric','Value','Change','Detail'],rows:artifact.metrics.map(m=>[m.label,m.value,m.change??'',m.detail??''])});}
 for(const section of artifact.sections){heading(section.heading,2);paragraph(section.body);}
 for(const chart of artifact.charts){data.blocks.push({id:makeId(),type:'chart',chart:{type:chart.type,title:chart.title,labels:[...chart.labels],values:[...chart.values]}});if(chart.unit)paragraph('Unit: '+chart.unit);if(chart.calculation)paragraph('Calculation: '+chart.calculation);if(chart.source)paragraph('Source: '+chart.source);}
 if(artifact.table){heading('Data table',2);data.blocks.push({id:makeId(),type:'table',columns:[...artifact.table.columns],rows:artifact.table.rows.map(r=>r.map(String))});}
 if(artifact.scenes.length){heading('Scenes',2);for(const scene of artifact.scenes){heading(scene.title,3);if(scene.kicker)paragraph(scene.kicker);paragraph(scene.body);paragraph(`Duration: ${scene.duration} seconds`);}}
 if(artifact.sources.length){heading('Sources',2);for(const source of artifact.sources){heading(source.name,3);paragraph(source.detail);}}
 return validateDocumentData(data);
}
