export type AnalyticsKind='messages'|'tools'|'agents'|'skills';
export type AnalyticsCounts=Record<AnalyticsKind,number>;
export interface AnalyticsData {days:number;offset:number;start:string;end:string;totals:AnalyticsCounts;daily:({date:string}&AnalyticsCounts)[];topChats:({id:string;title:string}&AnalyticsCounts)[];tools:{name:string;count:number}[];skills:{name:string;count:number}[];coverage:string;simulation?:boolean;}
