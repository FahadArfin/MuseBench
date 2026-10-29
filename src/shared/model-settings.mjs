import {REASONING_LEVELS} from './run-options.mjs';

// A saved choice or catalog default is not evidence of an applied native setting.
export function modelSettingsView({options={},runtime={}}={}){
 const rows=runtime.modelCatalog?.models??[],selected=rows.find(row=>options.model?row.id===options.model:row.isDefault);
 const requested={model:options.model?(selected?.label||options.model):selected?`Provider default · ${selected.label}`:'Provider default',effort:REASONING_LEVELS.includes(options.reasoning)?options.reasoning:'high',unavailable:!!runtime.modelCatalog&&(!selected||!selected.efforts.includes(options.reasoning))};
 const valid=runtime.simulation!==true&&runtime.permissionVerified===true&&!['unavailable','connecting','uncertain','checking-permissions','starting','submitting'].includes(runtime.status);
 const accepted=runtime.inputAccepted===true&&typeof runtime.runId==='string'&&!!runtime.runId;
 const working=['running','blocked'].includes(runtime.status)&&runtime.foregroundActive!==false;
 const terminal=['completed','failed','cancelled'].includes(runtime.status)&&runtime.cleanup==='confirmed';
 const session=runtime.transport==='msp'&&typeof runtime.sessionId==='string'&&!!runtime.sessionId;
 const evidence=valid&&(session||runtime.transport==='exec'&&accepted&&(working||terminal));
 const id=evidence&&typeof runtime.modelId==='string'&&runtime.modelId?runtime.modelId:null;
 const observed=id?{label:accepted&&working?'Current run':accepted&&terminal?'Last run':'Session model',model:rows.find(row=>row.id===id)?.label||id,id}:null;
 return {requested,observed,submittedEffort:observed&&accepted&&REASONING_LEVELS.includes(runtime.runOptions?.reasoning)?runtime.runOptions.reasoning:null,effectiveEffort:null};
}
