import type {WorkDocument} from './work-document-types';
export interface CreativeTemplate{id:string;title:string;description?:string;category:string;kind:WorkDocument['kind'];width?:number;height?:number;builtin?:boolean;favorite?:boolean;document:WorkDocument}
export const CREATIVE_TEMPLATES:readonly CreativeTemplate[];
export function filterCreativeTemplates(options?:{templates?:readonly CreativeTemplate[];query?:string;kind?:string;category?:string;favorites?:boolean}):CreativeTemplate[];
export function makeUserTemplate(document:WorkDocument,options?:{title?:string;category?:string;id?:string}):CreativeTemplate;
export function instantiateWorkTemplate(template:CreativeTemplate,options?:{title?:string;copyAsset?:(asset:WorkDocument['assets'][number])=>Promise<WorkDocument['assets'][number]>}):Promise<WorkDocument>;
