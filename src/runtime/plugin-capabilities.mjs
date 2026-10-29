const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const pluginPart=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(value)&&!value.includes('..');
export const nativeHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export function pluginMcpId(stableId){
 if(typeof stableId!=='string')return null;
 const parts=stableId.split(':');
 return parts.length===4&&parts[0]==='plugin'&&parts[2]==='mcp_server'&&pluginPart(parts[1])&&pluginPart(parts[3])?{pluginId:parts[1],capabilityId:parts[3]}:null;
}
export function nativeMcpDecision(stableId,value){
 return !!pluginMcpId(stableId)&&object(value)&&Object.keys(value).length===2&&typeof value.enabled==='boolean'&&nativeHash(value.trusted_definition_hash);
}
export function pluginDecisions(config){
 const value=config.runtime_capabilities;
 if(value===undefined||value===null)return{};
 if(!object(value)||Object.keys(value).length>500)throw Error('Unsupported native plugin capability settings.');
 return value;
}
