export interface SkillContextCost {startupBytes:number|null;startupTokens:number|null;invokeBytes:number|null;invokeTokens:number|null}
export interface SkillCatalogInfo {diagnostics:string[];omitted:number;checkedAt?:string;stale?:boolean}
export interface InspectedSkill {id:string;title:string;description:string;scope:string;activation:'on'|'off'|'user-only';contextCost?:SkillContextCost;diagnostics?:string[]}
export interface SkillContextSummary {count:number;enabled:number;manual:number;disabled:number;startupTokens:number|null;known:number;unknown:number;omitted:number;partial:boolean;diagnosticCount:number}
export function normalizeSkillCatalog(value:unknown):{skills:InspectedSkill[];skillCatalog:SkillCatalogInfo};
export function summarizeSkillContext(skills:InspectedSkill[],catalog?:SkillCatalogInfo):SkillContextSummary;
