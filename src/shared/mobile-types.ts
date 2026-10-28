export type MobileDeviceCommand={type:'status'|'start'|'stop'}|{type:'pair';address:string}|{type:'revoke';id:string};
export interface MobileDeviceState {running:boolean;port:number|null;name:string;addresses:string[];devices:{id:string;name:string;createdAt:number}[];pairing:{link:string;expiresAt:number}|null;simulation?:boolean}
