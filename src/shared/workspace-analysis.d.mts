export type WorkspaceToolset='navigation-v1'|'analysis-v1';
export interface WorkspaceOperation {name:string;description:string;inputSchema:{type:string;properties:Record<string,unknown>;required:string[];additionalProperties:boolean}}
export interface WorkspaceQuery {operation:string;path?:string;line?:number;column?:number;query?:string}
export function normalizeWorkspaceToolset(value?:unknown):WorkspaceToolset;
export function workspaceOperations(toolset?:WorkspaceToolset,query?:string):WorkspaceOperation[];
export function validateWorkspaceQuery(input:unknown,toolset?:WorkspaceToolset):WorkspaceQuery;
export function validateWorkspaceBatch(input:unknown):Array<WorkspaceQuery & {id:string}>;
