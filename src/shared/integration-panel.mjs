export const RUN_SETTING_FIELDS=Object.freeze([
 Object.freeze({key:'required',type:'boolean',label:'Required for replies',description:'Block new replies if this integration cannot start.'}),
 Object.freeze({key:'startupTimeout',type:'number',label:'Connection timeout',description:'Seconds to initialize the connection.',min:1,max:3600}),
 Object.freeze({key:'toolTimeout',type:'number',label:'Tool timeout',description:'Seconds allowed for each tool request.',min:1,max:3600}),
]);
export function validateRunSettings(values){
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length!==3||Object.keys(values).some(key=>!RUN_SETTING_FIELDS.some(field=>field.key===key)))throw Error('Invalid integration settings fields.');
 if(typeof values.required!=='boolean')throw Error('Required must be on or off.');
 for(const key of ['startupTimeout','toolTimeout'])if(!Number.isFinite(values[key])||values[key]<1||values[key]>3600)throw Error('Timeouts must be between 1 and 3600 seconds.');
 return{required:values.required,startupTimeout:values.startupTimeout,toolTimeout:values.toolTimeout};
}
export function runSettingsChanges(before,after){
 validateRunSettings(before);validateRunSettings(after);
 return RUN_SETTING_FIELDS.filter(field=>before[field.key]!==after[field.key]).map(field=>({key:field.key,label:field.label,before:before[field.key],after:after[field.key]}));
}
