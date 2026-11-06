import type {WorkDocument,WorkDocumentKind} from '../shared/work-document-types';
export function convertLegacyWorkArtifact(artifact:unknown,options?:{itemId?:string;kind?:WorkDocumentKind}):{document:WorkDocument;report:{sourceItemId:string|null;sourceRevision:number;conversion:string;losses:string[];attributions:string[];ai:false;retainedLegacyContent?:unknown;chartReferences?:unknown[]}};
