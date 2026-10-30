export interface ChatRelation {kind:'side'|'fork';parentTaskId:string;parentTitle:string;context:'fresh'|'native'|'retained';createdAt:string;messageId?:string;}
export interface RelatedChat {id:string;projectId:string;archived?:boolean;chatRelation?:ChatRelation|null;}
export type RequestOrigin='initial'|'history'|'placeholder';
export function resolveRequestOrigin(task:{id?:string;chatRelation?:unknown;requestOrigin?:unknown}|null|undefined):RequestOrigin;
export function restoreChatRelation(value:unknown,taskId?:string):ChatRelation|null;
export function relationParent<T extends RelatedChat>(task:T,tasks:T[]):T|null;
export function mainChat<T extends RelatedChat>(task:T,tasks:T[]):T;
export interface ChatRelationIndex<T extends RelatedChat> {main(task:T):T;parent(task:T):T|null;}
export function createChatRelationIndex<T extends RelatedChat>(tasks:T[]):ChatRelationIndex<T>;
