export interface WorkConversionReport {sourceItemId:string;sourceRevision:number;conversion:string;attributions:string[];losses:string[];notes:string[];}
export interface WorkConversionReportRecord {version:1;itemId:string;createdAt:string;report:WorkConversionReport;}
export const WORK_CONVERSION_REPORT_LIMITS:Readonly<{maxBytes:number;maxEntries:number;maxTextLength:number}>;
export function validateWorkConversionReport(value:unknown):WorkConversionReport;
export function createWorkConversionReportStore(options:{rootDir:string;now?:()=>string;beforePublish?:(context:{itemId:string})=>void|Promise<void>}):{initialize():Promise<void>;read(itemId:string):Promise<WorkConversionReportRecord|null>;write(request:{itemId:string;report:unknown}):Promise<WorkConversionReportRecord>;remove(itemId:string):Promise<{removed:true}>;close():Promise<void>};
