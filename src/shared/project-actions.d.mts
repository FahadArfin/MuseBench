export type ActionPlatform='win32'|'darwin'|'linux';
export interface ProjectActionDefinition {id:string;name:string;cwd:string;commands:Partial<Record<ActionPlatform,string>>;timeoutSeconds:number;}
export interface ProjectActionRow extends ProjectActionDefinition {command:string|null;folder:string;shell:string;supported:boolean;}
export interface ProjectActionsSnapshot {projectId?:string;taskId?:string;root:string;platform:ActionPlatform;revision:string;actions:ProjectActionRow[];sample?:boolean;}
export type ProjectActionRequest={type:'runProjectAction';projectId:string;taskId:string;revision:string;actionId:string}|{type:'saveProjectAction';projectId:string;taskId:string;revision:string;definition:ProjectActionDefinition};
export function validateProjectAction(value:unknown):ProjectActionDefinition;
export function validateProjectActionRequest(value:unknown):ProjectActionRequest;
