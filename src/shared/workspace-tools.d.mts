export interface WorkspaceTool {id:string;title:string;description:string;command:string|null;input:string;output:string;available:boolean;reason:string;}
export function workspaceTools(input?:{project?:boolean;task?:boolean}):WorkspaceTool[];
