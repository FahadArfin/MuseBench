export interface StudioSourceContext {trust:'untrusted-source-data';sources:{id:string;name:string;ref:string;excerpt:string;truncated:boolean}[];totalCharacters:number;maxCharacters:8000;}
export function readStudioSourceContext(options:{work:{getItem:(itemId:string)=>any;getWorkspace:(itemId:string)=>Promise<string>};itemId:string;sourceIds?:string[]}):Promise<StudioSourceContext>;
