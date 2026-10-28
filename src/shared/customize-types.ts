import type {CatalogPage,ExtensionKind} from './extension-catalog-types';
import type {NativeHook} from './native-hooks.mjs';
import type {InspectedSkill,SkillCatalogInfo} from './skill-context.mjs';
export type CustomizeTab='skills'|'connectors'|'plugins'|'mcp'|'hooks';
export interface ExtensionCapability {kind:string;count:number}
export interface HookPreset {id:string;name:string;revision:string;hooks:NativeHook[]}
export interface HookPresetState {revision:string;items:HookPreset[]}
export interface CustomizeState {simulation?:boolean;hooks?:{root:string;revision:string;items:NativeHook[]}|null;skillImports?:{title:string;folder:string;fingerprint:string;at:string}[];
 hookPresets?:HookPresetState|null;
 available:boolean;errors:string[];pluginsReviewed:boolean;pluginRevision:string|null;
 skills:InspectedSkill[];skillCatalog?:SkillCatalogInfo;
 plugins:{id:string;title:string;description:string;version:string;enabled:boolean;valid:boolean;capabilities:ExtensionCapability[];reviewRequired:boolean}[];
 servers:{name:string;revision:string;transport:'stdio'|'streamable_http';address:string;enabled:boolean;reviewed:boolean;oauth:boolean}[];
}
export interface PreparedExtension {source?:{repo:string;ref?:string;path:string;kind:string;commit:string;url:string};licenses?:string[];downloadedFiles?:{path:string;bytes:number;sha256:string}[];fingerprint?:string;instructions?:string;files?:string[];token:string;kind:'skills'|'plugins';title:string;folder:string;capabilities:ExtensionCapability[]}
export type ServerSetup={name:string;transport:'streamable_http';url:string}|{name:string;transport:'stdio';command:string;args:string[]};
export type CustomizeCommand={type:'catalogSearch';kind:ExtensionKind;query:string;source:'recommended'|'community';cursor?:string;refresh?:boolean}|{type:'prepareCatalog';id:string}|{type:'catalogServer';id:string;reviewed:true}|{type:'saveHookPreset';revision:string;id?:string;name:string;hooks:NativeHook[]}|{type:'deleteHookPreset';revision:string;id:string}|{type:'saveHooks';root:string;revision:string;hooks:NativeHook[];reviewed:true}|{type:'inspectProject'}|{type:'reviewProject'}|{type:'approveProject';root:string;fingerprint:string;reviewed:true}|{type:'revokeProject';root:string}|{type:'preparePackSkill';id:string}|{type:'refresh'|'prepareSkill'|'preparePlugin'}|{type:'install';token:string;reviewed:true}|{type:'skillActivation';id:string;activation:'on'|'off'|'user-only'}|{type:'createSkill';name:string;description:string;instructions:string}|{type:'pluginAction';revision:string|null;id:string;action:'enable'|'disable'|'remove';reviewed:true}|{type:'reviewPlugins';revision:string|null;reviewed:true}|{type:'saveServer';server:ServerSetup;reviewed:true}|{type:'serverAction';revision:string;name:string;action:'enable'|'disable'|'remove'|'login'|'logout'|'review';reviewed?:true};
export interface CustomizeResult {catalog?:CatalogPage;projectInstructions?:ProjectInstructionInspection;projectReview?:ProjectInstructionReview;state?:CustomizeState;prepared?:PreparedExtension|null;message?:string}

export interface ProjectInstructionInspection {
 simulation?:boolean;root:string;checkedAt:string;boundary:{kind:'git'|'filesystem'|'limit'|'unknown';root:string};
 selectedCount:number;selectedBytes:number|null;measuredBytes:number;complete:boolean;
 trust:{status:'reviewed'|'required'|'unavailable';reason?:string};
 levels:{root:string;issue?:string;files:{path:string;selected:boolean;shadowedBy?:string;bytes?:number;text?:string;issue?:string}[]}[];
}

export interface ProjectInstructionReview {root:string;fingerprint:string;reviewed:boolean;files:{path:string;text:string}[];}
