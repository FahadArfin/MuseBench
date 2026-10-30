export interface RunSettings {required:boolean;startupTimeout:number;toolTimeout:number}
export type RunSettingField={key:'required';type:'boolean';label:string;description:string}|{key:'startupTimeout'|'toolTimeout';type:'number';label:string;description:string;min:number;max:number};
export interface RunSettingChange {key:keyof RunSettings;label:string;before:number|boolean;after:number|boolean}
export interface IntegrationPanelState {schemaVersion:1;kind:'mcp-run-settings';name:string;revision:string;editable:boolean;reason?:string;fields:RunSettingField[];values?:RunSettings;simulation?:boolean}
export interface IntegrationReview {schemaVersion:1;kind:'mcp-run-settings';name:string;revision:string;token:string;changes:RunSettingChange[];expiresAt:string;simulation?:boolean}
export const RUN_SETTING_FIELDS:readonly RunSettingField[];
export function validateRunSettings(values:unknown):RunSettings;
export function runSettingsChanges(before:RunSettings,after:RunSettings):RunSettingChange[];
