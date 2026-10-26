export interface SiteSetup {audience:'private'|'unlisted'|'public';domain:string;discoverable:boolean;versionId:string;}
export const SITES_PUBLISHING_ENABLED:boolean;
export function readSiteSetup(storage:Pick<Storage,'getItem'>,id:string):{value:SiteSetup;warning:string};
export function saveSiteSetup(storage:Pick<Storage,'setItem'>,id:string,value:SiteSetup):SiteSetup;
