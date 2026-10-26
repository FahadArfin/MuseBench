export interface PermissionChoice { choiceId:string; label?:string; scope:'once'; decision:'approved'|'denied'|'abort'; decisionToken:string; }
export function permissionDetails(value:unknown): { pending:Record<string,unknown>|null; choices:PermissionChoice[]; tool:string;subject:string;args:string;truncated:boolean;incomplete:boolean;approvalAllowed:boolean;limit:number; };
