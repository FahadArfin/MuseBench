import type {WorkDocument} from '../shared/work-document-types';
import type {WorkArtifact} from '../shared/work-types';
export function createWorkArtifactSnapshot(value:unknown):WorkArtifact;
export function convertArtifactSelection(options:{artifact:unknown;selection:{type:'chart';index:number}|{type:'table'};targetKind:'design'|'slides'|'document';sourceItemId?:string;sourceRevision?:number;id?:string;now?:string}):WorkDocument;
