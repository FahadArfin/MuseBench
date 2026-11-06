export interface ImportWarning {surfaceId?:string;code:string;message:string;severity:'warning'|'error'|'info'}
export interface ImportReport {format:string;name:string;mode:'editable'|'reference';warnings:ImportWarning[];imported:{surfaces:number;nodes:number;assets:number};limitations:string[];originalAssetId?:string}
export function createImportReport(format:string,name:string):ImportReport;
export function addImportWarning(report:ImportReport,warning:Omit<ImportWarning,'severity'>&{severity?:ImportWarning['severity']}):ImportReport;
