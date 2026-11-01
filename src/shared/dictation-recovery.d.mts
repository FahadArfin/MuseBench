export const DICTATION_RECOVERY_KEY:string;
type RecoveryStorage={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):unknown};
export function createDictationRecovery(options?:{storage?:()=>RecoveryStorage;legacyStorage?:()=>RecoveryStorage;maxChatChars?:number;maxTotalChars?:number;maxChats?:number}):{
 load():void;text(context:string):string;error():string;retain(context:string,text:string):{text:string};remove(context:string):void;prune(context:string):void;flush():void;retry():void;subscribe(listener:()=>void):()=>void;
};
