export interface ChatRelation {kind:'side'|'fork';parentTaskId:string;parentTitle:string;context:'fresh'|'native'|'retained';createdAt:string;messageId?:string;}
export interface RelatedChat {id:string;projectId:string;archived?:boolean;chatRelation?:ChatRelation|null;}
export function restoreChatRelation(value:unknown,taskId?:string):ChatRelation|null;
export function relationParent<T extends RelatedChat>(task:T,tasks:T[]):T|null;
export function mainChat<T extends RelatedChat>(task:T,tasks:T[]):T;
