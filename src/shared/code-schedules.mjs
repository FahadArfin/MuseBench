import {validateRunOptions} from './run-options.mjs';

const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\0\x7f]/.test(value))throw Error(`Invalid ${label}.`);return value.trim();};
export function validateScheduleSpec(value){
 if(!plain(value)||Object.keys(value).some(key=>!['title','projectId','prompt','startAt','intervalMinutes','maxRuns','runOptions','fullAccess'].includes(key)))throw Error('Invalid schedule configuration.');
 const startAt=typeof value.startAt==='string'?Date.parse(value.startAt):NaN;
 if(!Number.isFinite(startAt)||startAt<0||startAt>8640000000000000)throw Error('Choose a valid start time.');
 if(!Number.isInteger(value.intervalMinutes)||value.intervalMinutes!==0&&(value.intervalMinutes<15||value.intervalMinutes>43200))throw Error('Repeat every 15 minutes to 30 days, or choose Once.');
 if(!Number.isInteger(value.maxRuns)||value.maxRuns<1||value.maxRuns>100)throw Error('Choose 1 to 100 total attempts.');
 if(typeof value.fullAccess!=='boolean')throw Error('Choose execution access explicitly.');
 const runOptions=validateRunOptions(value.runOptions);if(!runOptions.budget)throw Error('Choose a per-run budget.');
 return{title:text(value.title,100,'schedule name'),projectId:text(value.projectId,200,'project'),prompt:text(value.prompt,16000,'scheduled prompt'),startAt:new Date(startAt).toISOString(),intervalMinutes:value.intervalMinutes,maxRuns:value.maxRuns,runOptions,fullAccess:value.fullAccess};
}
export function validateScheduleAction(action){
 if(!plain(action)||action.type!=='codeSchedule'||!['save','enable','pause','remove','stop'].includes(action.operation))throw Error('Invalid schedule command.');
 const keys={save:['type','operation','id','expectedRevision','spec'],enable:['type','operation','id','expectedRevision','confirmed'],pause:['type','operation','id','expectedRevision'],remove:['type','operation','id','expectedRevision'],stop:['type','operation','id','runId']}[action.operation];
 if(Object.keys(action).some(key=>!keys.includes(key)))throw Error('Invalid schedule command fields.');
 if(action.operation!=='save'||action.id!==undefined)text(action.id,200,'schedule identity');
 if(action.operation!=='stop'&&(action.operation!=='save'||action.id!==undefined)&&(!Number.isSafeInteger(action.expectedRevision)||action.expectedRevision<1))throw Error('Invalid schedule revision.');
 if(action.operation==='save')validateScheduleSpec(action.spec);
 if(action.operation==='enable'&&action.confirmed!==true)throw Error('Confirm the schedule before enabling it.');
 if(action.operation==='stop')text(action.runId,200,'scheduled run');
 return action;
}
// Elapsed intervals deliberately avoid implying a calendar/DST recurrence.
export function nextOccurrence(due,intervalMinutes,now){
 if(!intervalMinutes)return null;const interval=intervalMinutes*60000;
 const next=due+(Math.floor(Math.max(0,now-due)/interval)+1)*interval;
 if(!Number.isFinite(next)||next>8640000000000000)throw Error('Schedule date is outside the supported range.');return next;
}
