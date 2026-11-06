import type {WorkDocument,WorkDocumentKind} from '../shared/work-document-types';
export type ConversionReport={sourceItemId:string;sourceRevision:number;conversion:string;losses:string[];assetCopies:{sourceAssetId:string;targetAssetId:string}[];attributions:string[];ai:boolean};
export type WorkConversionResult={document:WorkDocument;report:ConversionReport};
export type WorkConversionOptions={kind:WorkDocumentKind;copyMedia?:boolean;surfaceIds?:string[];template?:'classic'|'blank';title?:string;makeId?:()=>string};
export function workConversionOptions(document:WorkDocument):WorkDocumentKind[];
export function convertWorkDocument(document:WorkDocument,options:WorkConversionOptions):WorkConversionResult;
