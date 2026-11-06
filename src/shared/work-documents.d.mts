import type {WorkDocument,WorkDocumentKind,WorkDocumentCreateOptions,DesignDocument,ImageDocument,DesignData,SceneNode,WorkAsset} from './work-document-types';
import type {WorkArtifact} from './work-types';
export type {WorkDocument,WorkDocumentKind,SceneNode} from './work-document-types';
export class WorkDocumentValidationError extends Error {code:string;path:string;constructor(path:string,message:string,code?:string);}
export interface SceneValidationContext {assetIds?:Set<string>;ids?:Set<string>;path?:string;}
export function validateWorkDocument(value:unknown):WorkDocument;
export function validateWorkAssetOrigin(value:unknown,path?:string):WorkAsset['origin'];
export function validateSceneNodes(value:unknown,context?:SceneValidationContext):SceneNode[];
export function validateDesignData(value:unknown,context?:SceneValidationContext):DesignData;
export function createWorkDocument(kind:WorkDocumentKind,options?:WorkDocumentCreateOptions):WorkDocument;
export function createDesignDocument(options?:WorkDocumentCreateOptions):DesignDocument;
export function createImageDocument(options?:WorkDocumentCreateOptions):ImageDocument;
export function readWorkDocumentValue(value:unknown):WorkDocument|WorkArtifact;
