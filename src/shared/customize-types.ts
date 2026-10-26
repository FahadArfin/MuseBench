export type CustomizeTab='skills'|'connectors'|'plugins'|'mcp';
export interface ExtensionCapability {kind:string;count:number}
export interface CustomizeState {skillImports?:{title:string;folder:string;fingerprint:string;at:string}[];
 available:boolean;errors:string[];pluginsReviewed:boolean;pluginRevision:string|null;
 skills:{id:string;title:string;description:string;scope:string;activation:'on'|'off'|'user-only'}[];
 plugins:{id:string;title:string;description:string;version:string;enabled:boolean;valid:boolean;capabilities:ExtensionCapability[];reviewRequired:boolean}[];
 servers:{name:string;revision:string;transport:'stdio'|'streamable_http';address:string;enabled:boolean;reviewed:boolean;oauth:boolean}[];
}
export interface PreparedExtension {fingerprint?:string;instructions?:string;files?:string[];token:string;kind:'skills'|'plugins';title:string;folder:string;capabilities:ExtensionCapability[]}
export type ServerSetup={name:string;transport:'streamable_http';url:string}|{name:string;transport:'stdio';command:string;args:string[]};
export type CustomizeCommand={type:'preparePackSkill';id:string}|{type:'refresh'|'prepareSkill'|'preparePlugin'}|{type:'install';token:string;reviewed:true}|{type:'skillActivation';id:string;activation:'on'|'off'|'user-only'}|{type:'createSkill';name:string;description:string;instructions:string}|{type:'pluginAction';revision:string|null;id:string;action:'enable'|'disable'|'remove';reviewed:true}|{type:'reviewPlugins';revision:string|null;reviewed:true}|{type:'saveServer';server:ServerSetup;reviewed:true}|{type:'serverAction';revision:string;name:string;action:'enable'|'disable'|'remove'|'login'|'logout'|'review';reviewed?:true};
export interface CustomizeResult {state?:CustomizeState;prepared?:PreparedExtension|null;message?:string}
