export interface DesktopAllowedApp {id:string;name:string;path:string;}
export interface DesktopAssistState {
 supported:boolean;available:boolean;enabled:boolean;stopped:boolean;
 active:{taskId:string;appId:string;appName:string;windowId:string;since:string}|null;
 pending:{id:string;taskId:string;appId:string;appName:string;reason:string;expiresAt:number}|null;
 allowedApps:DesktopAllowedApp[];error?:string;
}
export type DesktopAssistCommand={type:'status'}|{type:'set';enabled:boolean}|{type:'decide';id:string;decision:'allow'|'always'|'deny'}|{type:'revoke';appId:string}|{type:'stop'}|{type:'resume'};
