export interface Workflow {id:string;title:string;scope:string[];checks:string[];phases:{title:string;instructions:string;budget:'standard'|'extended'|'deep'}[];}
export const DEFAULT_WORKFLOWS:Workflow[];
export function validateWorkflow(value:unknown):Workflow;
export function workflowPrompts(value:Workflow,objective:string):{text:string;budget:Workflow['phases'][number]['budget'];title:string;index:number}[];
