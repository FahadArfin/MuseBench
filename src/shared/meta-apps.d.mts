export type MetaAppId='google-drive'|'gmail'|'google-calendar'|'google-contacts'|'opentable'|'outlook-calendar'|'outlook-people'|'outlook-email';
export interface MetaAppsState {status:'idle'|'loading'|'ready'|'unavailable';items:{id:MetaAppId;status:'connected'|'unconnected'|'unknown'}[];updatedAt?:string;message?:string;}
export const META_APPS:readonly {readonly id:MetaAppId;readonly title:string}[];
export function unknownMetaApps():MetaAppsState['items'];
