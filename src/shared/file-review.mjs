const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
export function validateFileReviewInspection(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['taskId','scope','runId'].includes(key))||!id(value.taskId)||!['run','all'].includes(value.scope)||value.scope==='run'&&!id(value.runId)||value.scope==='all'&&value.runId!==undefined)throw Error('Invalid file review request.');
 return{taskId:value.taskId,scope:value.scope,...(value.scope==='run'?{runId:value.runId}:{})};
}
export function validateFileReviewRead(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['taskId','scope','runId','path','revision','cursor','limit'].includes(key)))throw Error('Invalid file review request.');
 const base=validateFileReviewInspection({taskId:value.taskId,scope:value.scope,...(value.runId!==undefined?{runId:value.runId}:{})});
 if(typeof value.path!=='string'||!value.path||value.path.length>1024||/[\x00-\x1f\\:]/.test(value.path)||value.path.startsWith('/')||value.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f0-9]{64}$/.test(value.revision??'')||value.cursor!==undefined&&(typeof value.cursor!=='string'||value.cursor.length>300)||value.limit!==undefined&&(!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>200))throw Error('Invalid captured file, revision or page.');
 return{...base,path:value.path,revision:value.revision,...(value.cursor!==undefined?{cursor:value.cursor}:{}),...(value.limit!==undefined?{limit:value.limit}:{})};
}
