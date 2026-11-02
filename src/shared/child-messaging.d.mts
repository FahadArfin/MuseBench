import type {Action,AppState,ChildControlReceipt,NativeChild,RuntimeState} from './types';
export function matchingChildReceipt(state:AppState|null,input:Extract<Action,{type:'childControl'}>,previousIds?:string[]):ChildControlReceipt|undefined;
export function childTargetPending(runtime:RuntimeState,itemId:string,child?:NonNullable<NativeChild['children']>[number]):boolean;
export function childGroup(item:NativeChild):'Active'|'Done';
