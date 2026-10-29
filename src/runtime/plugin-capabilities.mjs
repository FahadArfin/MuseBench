const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const pluginPart=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(value)&&!value.includes('..');
export const nativeHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export function pluginCapabilityId(stableId){
 if(typeof stableId!=='string')return null;
 const parts=stableId.split(':');
 return parts.length===4&&parts[0]==='plugin'&&['mcp_server','hook'].includes(parts[2])&&pluginPart(parts[1])&&pluginPart(parts[3])?{pluginId:parts[1],kind:parts[2],capabilityId:parts[3]}:null;
}
export function pluginMcpId(stableId){const id=pluginCapabilityId(stableId);return id?.kind==='mcp_server'?{pluginId:id.pluginId,capabilityId:id.capabilityId}:null;}
export function nativePluginDecision(stableId,value){
 return !!pluginCapabilityId(stableId)&&object(value)&&Object.keys(value).length===2&&typeof value.enabled==='boolean'&&nativeHash(value.trusted_definition_hash);
}
export function nativeMcpDecision(stableId,value){
 return !!pluginMcpId(stableId)&&nativePluginDecision(stableId,value);
}
export function pluginDecisions(config){
 const value=config.runtime_capabilities;
 if(value===undefined||value===null)return{};
 if(!object(value)||Object.keys(value).length>500)throw Error('Unsupported native plugin capability settings.');
 return value;
}
