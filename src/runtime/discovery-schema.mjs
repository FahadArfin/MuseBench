// Deliberately bounded JSON Schema subset. No regex, references, formats,
// coercion, defaults or plugin code. Runs exclusively in the gateway process.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const types=['object','array','string','number','integer','boolean','null'];
const keywords=new Set(['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','minimum','maximum','exclusiveMinimum','exclusiveMaximum','enum','const','description','title','$schema','allOf','anyOf','oneOf']);
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
export function supportedSchema(schema){
 if(bytes(schema)>32768)throw Error('Schema exceeds 32 KiB.');let nodes=0;
 let values=0;function whole(value,depth){if(depth>16||++values>4096)throw Error('Schema depth or size is excessive.');if(value&&typeof value==='object')for(const item of Object.values(value))whole(item,depth+1);}whole(schema,0);
 function walk(value,depth){
  if(depth>16||++nodes>2048||!object(value)||Object.keys(value).some(key=>!keywords.has(key)))throw Error('Unsupported or excessive schema.');
  if(value.$schema!==undefined&&!['https://json-schema.org/draft/2020-12/schema','http://json-schema.org/draft-07/schema#'].includes(value.$schema))throw Error('Unsupported schema dialect.');
  if(value.type!==undefined&&!(typeof value.type==='string'?types.includes(value.type):Array.isArray(value.type)&&value.type.length>0&&value.type.length<=7&&value.type.every(t=>types.includes(t))))throw Error('Invalid schema type.');
  for(const key of ['title','description'])if(value[key]!==undefined&&typeof value[key]!=='string')throw Error('Invalid schema metadata.');
  for(const key of ['minItems','maxItems','minLength','maxLength'])if(value[key]!==undefined&&(!Number.isSafeInteger(value[key])||value[key]<0))throw Error('Invalid schema bound.');
  for(const key of ['minimum','maximum','exclusiveMinimum','exclusiveMaximum'])if(value[key]!==undefined&&!Number.isFinite(value[key]))throw Error('Invalid schema numeric bound.');
  if(value.enum!==undefined&&(!Array.isArray(value.enum)||!value.enum.length||value.enum.length>200))throw Error('Invalid schema enum.');
  if(value.properties!==undefined){if(!object(value.properties)||Object.keys(value.properties).some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('Invalid schema properties.');for(const child of Object.values(value.properties))walk(child,depth+1);}
  if(value.required!==undefined&&(!Array.isArray(value.required)||value.required.some(v=>typeof v!=='string')||new Set(value.required).size!==value.required.length))throw Error('Invalid required properties.');
  if(value.additionalProperties!==undefined&&typeof value.additionalProperties!=='boolean')walk(value.additionalProperties,depth+1);
  if(value.items!==undefined)walk(value.items,depth+1);
  for(const key of ['allOf','anyOf','oneOf'])if(value[key]!==undefined){if(!Array.isArray(value[key])||!value[key].length||value[key].length>16)throw Error('Invalid schema alternatives.');for(const child of value[key])walk(child,depth+1);}
 }
 walk(schema,0);return schema;
}
export function validateDiscoveryArguments(schema,value){
 let work=0;const stable=value=>{if(++work>100000)throw Error('Argument validation work limit exceeded.');return Array.isArray(value)?value.map(stable):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;};const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
 function check(s,v,depth){
  if(++work>100000||depth>32)throw Error('Argument validation work limit exceeded.');
  const actual=v===null?'null':Array.isArray(v)?'array':typeof v;
  if(s.type!==undefined){const expected=Array.isArray(s.type)?s.type:[s.type];if(!expected.some(t=>t===actual||t==='integer'&&actual==='number'&&Number.isInteger(v)))return false;}
  if(s.enum&&!s.enum.some(item=>equal(item,v))||Object.hasOwn(s,'const')&&!equal(s.const,v))return false;
  if(s.allOf&&!s.allOf.every(c=>check(c,v,depth+1))||s.anyOf&&!s.anyOf.some(c=>check(c,v,depth+1))||s.oneOf&&s.oneOf.filter(c=>check(c,v,depth+1)).length!==1)return false;
  if(actual==='object'){
   if(s.required?.some(key=>!Object.hasOwn(v,key)))return false;
   for(const [key,item] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(key))return false;const child=object(s.properties)&&Object.hasOwn(s.properties,key)?s.properties[key]:undefined;if(child){if(!check(child,item,depth+1))return false;}else if(s.additionalProperties===false)return false;else if(object(s.additionalProperties)&&!check(s.additionalProperties,item,depth+1))return false;}
  }
  if(actual==='array'&&(v.length<(s.minItems??0)||v.length>(s.maxItems??Infinity)||s.items&&!v.every(item=>check(s.items,item,depth+1))))return false;
  if(actual==='string'){const length=[...v].length;if(length<(s.minLength??0)||length>(s.maxLength??Infinity))return false;}
  if(actual==='number'&&(!Number.isFinite(v)||v<(s.minimum??-Infinity)||v>(s.maximum??Infinity)||s.exclusiveMinimum!==undefined&&v<=s.exclusiveMinimum||s.exclusiveMaximum!==undefined&&v>=s.exclusiveMaximum))return false;
  return true;
 }
 if(!check(schema,value,0))throw Error('Tool arguments do not match the discovered schema.');
}
