import type {WorkDocument,WorkAsset} from '../shared/work-document-types';
export const WORK_PACKAGE_LIMITS:Readonly<{maxPackageBytes:number;maxDecodedBytes:number;maxAssetBytes:number;maxAssets:number;maxHistory:number;maxDocumentBytes:number}>;
export interface WorkProjectPackageValue {document:WorkDocument;history:WorkDocument[];assets:{hash:string;bytes:Buffer}[];}
export function createWorkProjectPackage(options:{document:WorkDocument;resolveAsset?:(asset:WorkAsset)=>Promise<Uint8Array>|Uint8Array;includeHistory?:boolean;history?:WorkDocument[]}):Promise<Buffer>;
export function validateWorkProjectPackage(bytes:Buffer|Uint8Array|string):WorkProjectPackageValue;
export function importWorkProjectPackage(options:{bytes:Buffer|Uint8Array|string;writeAsset?:(entry:{asset:WorkAsset;bytes:Buffer})=>Promise<WorkAsset>|WorkAsset;createId?:()=>string;now?:string}):Promise<{document:WorkDocument;history:WorkDocument[]}>;
