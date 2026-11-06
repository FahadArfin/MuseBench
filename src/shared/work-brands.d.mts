import type {WorkDocument,WorkAsset} from './work-document-types';
export interface WorkBrandKit{id:string;name:string;colors:string[];fonts:string[];logos:string[];logoAssets?:WorkAsset[];logoStorageId?:string;textStyles:Partial<Record<'heading'|'body'|'caption',{fontFamily?:string;fontSize?:number;fontWeight?:number;color?:string}>>}
export function validateBrandKit(value:unknown):WorkBrandKit;
export function missingBrandFonts(kit:WorkBrandKit,available?:(font:string)=>boolean):string[];
export function applyBrandKit(document:WorkDocument,kit:WorkBrandKit,selection?:{surfaceId:string;nodeIds:string[]}):WorkDocument;

export function isWorkFontAvailable(font:string):boolean;

export function applyPreparedBrandKit(document:WorkDocument,kit:WorkBrandKit,assets?:WorkAsset[],selection?:{surfaceId:string;nodeIds:string[]},options?:{includeLogos?:boolean}):WorkDocument;
