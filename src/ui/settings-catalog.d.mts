export type SettingsCategory='customize'|'connectors'|'plugins'|'mcp'|'hooks'|'connections'|'general'|'notifications'|'voice'|'shortcuts'|'code'|'memory'|'skills'|'connection'|'mobile'|'control'|'account'|'billing'|'data'|'updates'|'about';
export interface SettingsEntry {id:SettingsCategory;label:string;group:string;keywords:string;}
export const SETTINGS_CATEGORIES:readonly SettingsEntry[];
export function findSettings(query?:string):SettingsEntry[];
