const safeActions=new Set(['refresh','clearError','selectTask','selectProject','inspectChild','disconnectMuse','stopWork','cancelCheck','stopPreview','cancelReviewers','pauseGoalContinuation','pauseQueue']);
// A blocked payer/sign-in must prevent new execution, not prevent the user
// from stopping existing work or navigating to the owner that needs attention.
export function allowedWhileBillingBlocked(channel,command){
 if(!command||typeof command!=='object'||Array.isArray(command))return false;
 if(channel==='musebench:action')return safeActions.has(command.type)||command.type==='childControl'&&['interrupt','stop','close'].includes(command.action)||command.type==='codeSchedule'&&['pause','remove'].includes(command.operation);
 return channel==='musebench:work'&&command.type==='stop';
}
