export interface ReviewFinding {severity:'high'|'medium'|'low';path:string;line:number;message:string;evidence:string;}
export interface ReviewContract {parentTaskId:string;parentProjectId:string;sourceRevision:string;inputRevision:string;role:string;question:string;budget:'standard';createdAt:string;integratedAt?:string;}
export const REVIEW_ROLES:string[];
export function reviewPrompt(input:{role:string;question:string;sourceRevision:string}):string;
export function parseReview(text:string):{findings:ReviewFinding[];unresolved:string[]};
