import type {WorkDocument,WorkDocumentKind} from './work-document-types';
export interface WorkStudioSelection {surfaceId:string;nodeIds:string[];scope?:'selection'|'surface'|'project';}
export type WorkStudioRequest =
 | {type:'convertLegacy';itemId:string}
 | {type:'sources'|'importSources';itemId:string}
 | {type:'mediaDerivative';itemId:string;assetId:string;kind:'thumbnail'|'waveform'|'proxy'}
 | {type:'mediaDerivatives';itemId:string;assetId?:string}
 | {type:'convertArtifact';itemId:string;selection:{type:'chart';index:number}|{type:'table'};targetKind:'design'|'slides'|'document'}
 | {type:'create';kind:WorkDocumentKind;title:string;document?:WorkDocument}
 | {type:'read';itemId:string;revision?:number}
 | {type:'commit';itemId:string;expectedRevision:number;operations:unknown[];origin?:'user'|'muse'|'import'|'restore'}
 | {type:'versions'|'assets'|'importAssets'|'importOffice'|'packageExport'|'exportCapabilities';itemId:string;[key:string]:unknown}
 | {type:'checkpoint';itemId:string;name:string}
 | {type:'restore';itemId:string;revision:number;expectedRevision:number}
 | {type:'jobs';itemId?:string}
 | {type:'export';itemId:string;revision:number;format:string;settings?:Record<string,unknown>}
 | {type:'cancelJob'|'retryJob'|'openJob';jobId:string}
 | {type:'templates'|'brands'|'convert'|'duplicate'|'packageImport'|'renameAsset'|'removeAsset'|'relinkAsset'|'propose'|'applyProposal'|'discardProposal'|'proposals'|'stopProposal'|'providerCapabilities'|'providerStart'|'providerPoll'|'providerCancel'|'providerAccept'|'providerJobs'|'present'|'presenterSlide'|'closePresenter';[key:string]:unknown};
// Individual callers narrow result by request; native implementation validates
// every request and returns structured-cloneable records, never credentials.
export type WorkStudioResult = any;
