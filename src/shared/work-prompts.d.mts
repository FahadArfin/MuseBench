import type {WorkDocument} from './work-document-types';
export interface WorkProposalSelection {scope:'selection'|'surface'|'project';surfaceId:string;nodeIds:string[];}
export interface WorkProposalSourceContext {trust?:'untrusted-source-data';sources:{id:string;name:string;ref:string;excerpt:string;truncated:boolean}[];totalCharacters:number;maxCharacters:number;}
export function workProposalSurfaces(document:WorkDocument):any[];
export function validateWorkSelection(document:WorkDocument,selection:unknown):WorkProposalSelection;
export function createWorkProposalPrompt(options:{document:WorkDocument;proposalId:string;selection:unknown;instruction:string;sourceContext?:WorkProposalSourceContext}):{prompt:string;filename:string;selection:WorkProposalSelection};
