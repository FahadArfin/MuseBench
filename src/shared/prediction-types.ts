export type PredictionCommand={type:'configure';enabled:boolean}|{type:'request';taskId:string;replyId:string;requestId:string}|{type:'cancel';requestId:string};
export type PredictionResult={text:string;requestId?:string};
