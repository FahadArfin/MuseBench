import type {WorkDocument} from '../shared/work-document-types';
import type {WorkEditOperation} from '../shared/work-operations.mjs';

export type WorkCommitOrigin='user'|'muse'|'import'|'restore';
export interface WorkRecovery {message:string;reason?:string;failedRevision?:number;recoveredRevision?:number;}
export interface WorkDocumentRead {document:WorkDocument;revision:number;recovered:boolean;recovery?:WorkRecovery;}
export interface WorkDocumentCommit extends WorkDocumentRead {warning?:string;history:{prunedRevisions:number[];maxHistoryCount:number;maxHistoryBytes:number};}
export interface WorkVersion {revision:number;title:string;createdAt:string;origin:WorkCommitOrigin;bytes:number;name?:string;current:boolean;}
export interface WorkVersionList {versions:WorkVersion[];storage:{bytes:number;count:number;pressure:boolean;preservedBytes:number;maxHistoryCount:number;maxHistoryBytes:number};recovered:boolean;recovery?:WorkRecovery;}
export interface WorkDocumentStore {
  initialize():Promise<void>;
  create(request:{itemId:string;document:WorkDocument}):Promise<WorkDocumentCommit>;
  read(itemId:string,options?:{revision?:number}):Promise<WorkDocumentRead>;
  commit(request:{itemId:string;expectedRevision:number;operations:readonly WorkEditOperation[];origin?:WorkCommitOrigin}):Promise<WorkDocumentCommit>;
  listVersions(itemId:string):Promise<WorkVersionList>;
  checkpoint(request:{itemId:string;name:string;revision?:number}):Promise<WorkVersion>;
  restore(request:{itemId:string;revision:number;expectedRevision:number}):Promise<WorkDocumentCommit>;
  close():Promise<void>;
}
export class WorkDocumentStoreError extends Error {code:string;expectedRevision?:number;currentRevision?:number;constructor(code:string,message:string,details?:Record<string,unknown>);}
export function createWorkDocumentStore(options:{rootDir:string;maxHistoryCount?:number;maxHistoryBytes?:number;now?:()=>string;beforeWrite?:(context:{phase:'snapshot'|'backup'|'pointer'|'mirror';path:string;itemId:string;revision:number})=>void|Promise<void>}):WorkDocumentStore;
