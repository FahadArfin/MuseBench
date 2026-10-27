export const CHILD_ACTION_LABELS:Readonly<Record<string,string>>;
export function childActions(item:{kind?:string;status?:string;controlStatus?:string;terminal?:string}):string[];
export function childWorking(item:{kind?:string;status?:string;controlStatus?:string}):boolean;
