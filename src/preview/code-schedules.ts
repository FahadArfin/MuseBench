import type {AppState} from '../shared/types';
import type {CodeScheduleAction} from '../shared/code-schedules.mjs';
import {validateScheduleAction,validateScheduleSpec,nextOccurrence} from '../shared/code-schedules.mjs';

// Preview configuration only. No scheduler, runtime, provider or durable storage.
export function applyPreviewSchedule(state:AppState,input:CodeScheduleAction){
 const action=validateScheduleAction(input),rows=state.codeSchedules??=[];state.codeSchedulesAvailable=true;state.codeSchedulesSimulation=true;
 const row='id' in action?rows.find(row=>row.id===action.id):undefined;
 if(action.operation!=='save'||action.id){if(!row)throw Error('Schedule is unavailable.');if('expectedRevision' in action&&action.expectedRevision!==row.revision)throw Error('This schedule changed. Review it again.');}
 if(action.operation==='save'){
  const spec=validateScheduleSpec(action.spec),project=state.projects.find(p=>p.id===spec.projectId);if(!project)throw Error('Choose a project.');if(Date.parse(spec.startAt)<=Date.now())throw Error('Choose a future start time.');if(!row&&rows.length>=50)throw Error('Keep at most 50 schedules.');
  const saved={id:row?.id??crypto.randomUUID(),revision:(row?.revision??0)+1,spec,root:project.root,enabled:false,nextAt:spec.startAt,attempts:row?.attempts??0,active:null,history:row?.history??[],outcomes:row?.outcomes??0,historyTruncated:row?.historyTruncated??false,reason:'Saved paused. Review and enable to authorize runs.',createdAt:row?.createdAt??new Date().toISOString()};state.codeSchedules=[...rows.filter(r=>r.id!==saved.id),saved];
 }else if(action.operation==='enable'&&row){if(row.attempts>=row.spec.maxRuns)throw Error('The attempt limit has been reached.');if(!row.nextAt)throw Error('Choose a future start time.');if(Date.parse(row.nextAt)<=Date.now()){const next=nextOccurrence(Date.parse(row.nextAt),row.spec.intervalMinutes,Date.now());if(!next)throw Error('Choose a future start time.');row.nextAt=new Date(next).toISOString();}row.enabled=true;row.reason=null;row.revision++;}
 else if(action.operation==='pause'&&row){row.enabled=false;row.reason='Paused.';row.revision++;}
 else if(action.operation==='remove')state.codeSchedules=rows.filter(r=>r.id!==action.id);
 else throw Error('Preview only. There is no actual scheduled run to stop.');
}
