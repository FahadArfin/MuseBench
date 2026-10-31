export type NativeCommitState=Record<string,string|boolean|null|undefined>;
export function createNavigationCommitGate():{begin(request:{id:string;deadline:number},expected:NativeCommitState):Promise<Element>;commit(id:string,actual:NativeCommitState,root:Element|null):boolean;cancel(id?:string):void};
export function settleNavigationVisuals(root:Element,deadline:number,signal?:AbortSignal):Promise<boolean>;
