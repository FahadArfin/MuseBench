import type {Task,RuntimeState,RunOptions} from './types';
export type WorkTeam='finance'|'operations'|'marketing'|'sales'|'analytics'|'engineering';
export type WorkKind='dashboard'|'motion'|'document'|'slides';
export interface WorkSource{id:string;name:string;path:string;bytes:number;addedAt:string;}
export interface WorkItem{id:string;title:string;team:WorkTeam;kind:WorkKind;projectId:string;taskId:string;createdAt:string;updatedAt:string;sources:WorkSource[];demo:boolean;}
export interface WorkArtifact{version:1;kind:WorkKind;title:string;summary:string;sources:{name:string;detail:string}[];metrics:{label:string;value:string;change?:string;detail?:string}[];charts:{title:string;type:'bar'|'line';labels:string[];values:number[];unit?:string;calculation?:string;source?:string}[];table?:{columns:string[];rows:(string|number)[][]};sections:{heading:string;body:string}[];scenes:{title:string;body:string;kicker?:string;duration:number}[];}
export interface WorkState{items:WorkItem[];activeId:string|null;item:WorkItem|null;task:Task|null;runtime:RuntimeState;busy:boolean;error:string|null;artifact:WorkArtifact|null;artifactError:string|null;artifactUpdatedAt:string|null;capabilities:{mp4:boolean};}
export type WorkCommand={type:'create';team:WorkTeam;kind:WorkKind;title:string;brief:string;runOptions?:RunOptions;demo?:boolean}|{type:'select';id:string}|{type:'send';text:string}|{type:'stop'|'refresh'|'clearError'}|{type:'saveArtifact';artifact:WorkArtifact};
export type WorkExport='html'|'json'|'md'|'csv'|'pdf'|'mp4';
