export interface GoalDriver {id:string;armed:boolean;phase:'pending'|'running'|'checking';rounds:number;maxRounds:number;deadline:number;minutes:number;repeatedFailures:number;lastFailure:string;reason:string;}
export function newGoalDriver(input?:{maxRounds?:number;minutes?:number;now?:number}):GoalDriver;
export function pauseGoalDriver(driver?:GoalDriver,reason?:string):void;
export function goalDecision(driver:GoalDriver,input?:{now?:number;userPending?:boolean;result?:string;validation?:string}):{kind:string;reason?:string};
