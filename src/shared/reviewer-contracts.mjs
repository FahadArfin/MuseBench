export const REVIEW_ROLES=['correctness','tests','investigator'];
export function reviewPrompt({role,question,sourceRevision}){
 if(!REVIEW_ROLES.includes(role)||typeof question!=='string'||!question.trim()||question.length>2000)throw Error('Choose a review role and a question up to 2,000 characters.');
 return `Independent ${role} review. Source revision: ${sourceRevision}.\nQuestion: ${question}\nInspect current files, find concrete evidence and do not edit files. This instruction is not a filesystem permission boundary; existing sandbox and approval controls still apply. Do not start child agents or external side effects.\nReturn only JSON: {"findings":[{"severity":"high|medium|low","path":"relative/file","line":1,"message":"concrete problem","evidence":"observed evidence"}],"unresolved":["checks or facts you could not verify"]}. Use an empty findings array when no supported findings exist. Do not infer passing tests from the absence of errors.`;
}
export function parseReview(text){
 if(typeof text!=='string'||text.length>30000)throw Error('Review must be bounded JSON.');let value;try{value=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw Error('Reviewer has not returned the required JSON findings.');}
 if(!value||!Array.isArray(value.findings)||value.findings.length>20||!Array.isArray(value.unresolved)||value.unresolved.length>20||value.unresolved.some(s=>typeof s!=='string'||s.length>1000))throw Error('Invalid review findings.');
 for(const f of value.findings)if(!f||!['high','medium','low'].includes(f.severity)||typeof f.path!=='string'||!f.path||f.path.length>1024||f.path.includes('\\')||f.path.includes(':')||f.path.startsWith('/')||f.path.split('/').some(p=>p==='..'||p==='.')||!Number.isInteger(f.line)||f.line<1||f.line>10000000||['message','evidence'].some(k=>typeof f[k]!=='string'||!f[k].trim()||f[k].length>2000))throw Error('Invalid review evidence or path.');
 return{findings:value.findings.map(({severity,path,line,message,evidence})=>({severity,path,line,message,evidence})),unresolved:value.unresolved};
}
