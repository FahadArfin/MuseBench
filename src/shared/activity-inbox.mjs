export const ACTIVITY_LABELS=Object.freeze({run_completed:'Run completed',run_attention:'Run needs attention',run_stopped:'Run stopped',response_requested:'Response requested',approval_requested:'Approval requested',check_passed:'Check passed',check_failed:'Check did not pass',check_stopped:'Check stopped',check_stale:'Check result became stale'});

export function validateActivityRead(action){
 if(!action||typeof action!=='object'||Array.isArray(action)||action.type!=='setActivityRead'||typeof action.read!=='boolean'||!Array.isArray(action.ids)||action.ids.length<1||action.ids.length>200||action.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||Object.keys(action).some(key=>!['type','ids','read'].includes(key)))throw Error('Invalid activity read selection.');
 return action;
}
