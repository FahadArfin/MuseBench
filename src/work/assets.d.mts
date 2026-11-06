import type {Buffer} from 'node:buffer';
import type {WorkAsset,WorkDocument} from '../shared/work-document-types';
import type {WorkManagedAsset} from '../shared/work-job-types';
export const WORK_ASSET_LIMITS:Readonly<{maxFileBytes:number;maxPixels:number;maxDimension:number;maxFilesPerImport:number;maxAssetsPerItem:number;maxImportBytes:number;thumbnailSize:number}>;
export interface WorkAssetAddress {itemId:string;assetId:string;hash?:string;thumbnail?:boolean;}
export interface WorkAssetImportResult {assets:WorkAsset[];errors:{name:string;error:string}[];cancelled:boolean;}
export interface WorkAssetStore {
 initialize():Promise<void>;
 issueImportToken(input:{itemId:string;ownerId:string;paths:string[];expiresInMs?:number}):string;
 import(input:{itemId:string;ownerId:string;importToken:string;replaceAssetId?:string;origin?:WorkAsset['origin']}):Promise<WorkAssetImportResult>;
 importBytes(input:{itemId:string;asset?:Partial<WorkAsset>;buffer:Buffer;name?:string;mediaType?:string;origin?:WorkAsset['origin'];validated?:boolean}):Promise<WorkAsset>;
 copy(input:{sourceItemId:string;itemId:string;assetId:string;hash?:string}):Promise<WorkAsset>;
 list(input:{itemId:string;document?:WorkDocument}):Promise<WorkManagedAsset[]>;
 describe(input:WorkAssetAddress):Promise<WorkAsset>;
 resolve(input:WorkAssetAddress):Promise<string>;
 read(input:WorkAssetAddress):Promise<{buffer:Buffer;mediaType:string;asset:WorkAsset}>;
 rename(input:{itemId:string;assetId:string;name:string}):Promise<WorkAsset>;
 setFavorite(input:{itemId:string;assetId:string;favorite:boolean}):Promise<{assetId:string;favorite:boolean}>;
 markUsed(input:{itemId:string;assetId:string}):Promise<{assetId:string;lastUsedAt:string}>;
 remove(input:{itemId:string;assetId:string}):Promise<{removed:true;preservedForHistory:true}>;
 close():Promise<void>;
}
export function createWorkAssetStore(options:{rootDir:string;decodeImage?:(input:{buffer:Buffer;width:number;height:number;mediaType:string;maxThumbnailSize:number;orientation?:number;encodedWidth?:number;encodedHeight?:number})=>Promise<{width:number;height:number;thumbnail:Buffer}>;probeMedia?:(input:{filePath:string})=>Promise<{decodable:boolean;duration:number;width?:number;height?:number}>;createMediaThumbnail?:(input:{filePath:string;metadata:unknown;maxThumbnailSize:number;orientation?:number;encodedWidth?:number;encodedHeight?:number})=>Promise<Buffer>;getDocument?:(itemId:string)=>Promise<WorkDocument>}):WorkAssetStore;
