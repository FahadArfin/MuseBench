import {REASONING_LEVELS} from './run-options.mjs';
export function normalizeModels(value){
 if(!value||value.providerId!=='meta'||!['providerCatalog','bundledCatalog'].includes(value.source)||!Array.isArray(value.models)||value.models.length>200)throw Error('A supported native model catalog was not returned.');
 const models=[],seen=new Set();for(const row of value.models){if(!row||row.providerId!=='meta'||row.profileId!==value.profileId||typeof row.modelId!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(row.modelId)||seen.has(row.modelId))continue;seen.add(row.modelId);
 const efforts=Array.isArray(row.variants)?[...new Set(row.variants.filter(e=>REASONING_LEVELS.includes(e)))]:[];
 models.push({id:row.modelId,label:typeof row.displayLabel==='string'?row.displayLabel.slice(0,200):row.modelId,description:typeof row.description==='string'?row.description.slice(0,1200):'',efforts,defaultEffort:efforts.includes(row.defaultReasoningEffort)?row.defaultReasoningEffort:null,isDefault:row.isDefault===true,contextLimit:Number.isSafeInteger(row.contextLimit)&&row.contextLimit>0?row.contextLimit:null});}
 return {source:value.source,models};
}
export function modelForOptions(catalog,options){const row=options.model?catalog?.models.find(m=>m.id===options.model):catalog?.models.find(m=>m.isDefault);if(!row)throw Error('The chosen model is missing from the current native catalog. Refresh models and choose again.');if(!row.efforts.includes(options.reasoning))throw Error('The chosen model does not declare support for this reasoning effort. Select a supported tier.');return row;}
