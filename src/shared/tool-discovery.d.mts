export interface DiscoveryIdentity {sources:Array<{id:string;revision:string;authBindingRevision?:string}>}
export interface DiscoverySelection extends DiscoveryIdentity {reviewed:true}
export interface DiscoverySource {id:string;name:string;revision:string;address:string;transport?:'stdio'|'streamable-http';headerKeys?:string[];resolvedOrigin?:string;cwd:string;environmentKeys:string[];eligible:boolean;reason:string;authEligible?:boolean;auth?:import('./discovery-auth.mjs').SafeAuthState;authBindingRevision?:string}
export interface DiscoveryInspection {ownerId:string;root:string;rows:DiscoverySource[]}
export function discoveryIdentity(value:unknown):DiscoveryIdentity;
export function discoverySelection(value:unknown):DiscoverySelection;
export function sameDiscovery(a:unknown,b:unknown):boolean;
