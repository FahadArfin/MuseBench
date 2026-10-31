export interface ResponseQuote {taskId:string;messageId:string;displayedText:string;selection?:string|null;draftText?:string;}
export function buildResponseQuote(input:ResponseQuote):string;
