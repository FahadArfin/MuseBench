export interface LatestReadQueue {schedule<T>(request:{read:()=>Promise<T>|T;onValue:(value:T)=>void;onError:(error:unknown)=>void;delay?:number}):()=>void;}
export function createLatestReadQueue(options?:{setTimer?:(callback:()=>void,delay:number)=>unknown;clearTimer?:(timer:unknown)=>void;now?:()=>number}):LatestReadQueue;
