import {validateWorkDocument} from './work-documents.mjs';

const FIELDS={replaceData:['type','data'],rename:['type','title'],replaceAssets:['type','assets']};

/** Renderer edits may replace only validated editable content. They never
 * contain property paths, executable expressions, identity, or revision fields. */
export function applyWorkOperations(document,operations){
  const next=validateWorkDocument(document);
  if(!Array.isArray(operations)||operations.length<1||operations.length>100)throw Error('Choose between 1 and 100 Work edits.');
  for(const operation of operations){
    if(!operation||typeof operation!=='object'||Array.isArray(operation)||!Object.hasOwn(FIELDS,operation.type))throw Error('Unknown Work edit operation.');
    const fields=FIELDS[operation.type];
    if(Object.keys(operation).some(field=>!fields.includes(field))||fields.some(field=>!Object.hasOwn(operation,field)))throw Error('Unsupported or missing Work edit fields.');
    if(operation.type==='replaceData')next.data=structuredClone(operation.data);
    if(operation.type==='rename')next.title=operation.title;
    if(operation.type==='replaceAssets')next.assets=structuredClone(operation.assets);
  }
  return validateWorkDocument(next);
}
