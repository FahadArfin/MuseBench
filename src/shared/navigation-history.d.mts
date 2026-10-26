export interface NavigationHistory {entries:string[];index:number}
export function visit(history:NavigationHistory,route:string,limit?:number):NavigationHistory;
export function historyTarget(history:NavigationHistory,direction:-1|1,available?:(route:string)=>boolean):number;
