import type {RunOptions} from './types';
export interface NativeModel {id:string;label:string;description:string;efforts:RunOptions['reasoning'][];defaultEffort:RunOptions['reasoning']|null;isDefault:boolean;contextLimit:number|null;}
export interface NativeModelCatalog {source:string;models:NativeModel[];}
export function normalizeModels(value:unknown):NativeModelCatalog;
export function modelForOptions(catalog:NativeModelCatalog|undefined,options:RunOptions):NativeModel;
