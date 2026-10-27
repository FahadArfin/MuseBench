import type {AnalyticsData,AnalyticsCounts} from '../shared/analytics';
export function sampleAnalytics({days,offset}:{days:7|30;offset:number}):AnalyticsData{
 const end=new Date();end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()+1-offset*days);const start=new Date(end.getTime()-days*86400000);
 const daily=Array.from({length:days},(_,i)=>({date:new Date(start.getTime()+i*86400000).toISOString().slice(0,10),messages:(i*13+7)%32,tools:(i*17+11)%70,agents:i%3,skills:(i*7+3)%15}));
 const totals=daily.reduce((sum,d)=>({messages:sum.messages+d.messages,tools:sum.tools+d.tools,agents:sum.agents+d.agents,skills:sum.skills+d.skills}),{messages:0,tools:0,agents:0,skills:0} as AnalyticsCounts);
 return {simulation:true,days,offset,start:start.toISOString(),end:new Date(end.getTime()-1).toISOString(),totals,daily,topChats:[{id:'sample-analytics',title:'Build a clearer project overview',...totals}],tools:[{name:'read_file',count:Math.floor(totals.tools*.65)},{name:'edit_file',count:totals.tools-Math.floor(totals.tools*.65)}],skills:[{name:'browser-app-delivery',count:totals.skills}],coverage:'Sample activity for visual review. No live account data or telemetry is collected by this preview.'};
}
