export interface WorkVideoExportData {timebase:number;tracks:{clips:{start:number;duration:number}[]}[];captions:{end:number}[];}
export function workVideoExportExtent(data:WorkVideoExportData):{timebase:number;endTick:number;seconds:number};
export function workVideoRangeFromSeconds(data:WorkVideoExportData,startSeconds:number,endSeconds:number):{start:number;end:number};
export function normalizeWorkPageRange(range:string|undefined,count:number):string;
export function validateWorkPrintSetup(surfaces:{name?:string;width:number;height:number}[],settings?:{dpi?:number;bleed?:number;margin?:number;cropMarks?:boolean}):{width:number;height:number;widthInches:number;heightInches:number}[];
