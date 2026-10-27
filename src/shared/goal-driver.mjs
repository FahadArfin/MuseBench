export function newGoalDriver({maxRounds=3,minutes=10,now=Date.now()}={}){if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>8||!Number.isInteger(minutes)||minutes<1||minutes>60)throw Error('Choose a budget of 1–8 rounds and 1–60 minutes.');return{id:crypto.randomUUID(),armed:true,phase:'pending',rounds:0,maxRounds,deadline:now+minutes*60000,minutes,repeatedFailures:0,lastFailure:'',reason:''};}
export function pauseGoalDriver(driver,reason){if(driver){driver.armed=false;driver.reason=reason;}}
export function goalDecision(driver,{now=Date.now(),userPending=false,result,validation}={}){
 if(!driver?.armed)return{kind:'idle'};const pause=reason=>({kind:'pause',reason});
 if(userPending)return pause('User input takes priority');if(now>=driver.deadline)return pause('Time budget reached');
 if(driver.phase==='running')return result==='completed'?{kind:'validate'}:pause('Run outcome is not confirmed; inspect the session');
 if(driver.phase==='checking'){if(validation==='running')return{kind:'idle'};if(validation==='passed')return pause('Checks passed; review the result');if(validation!=='failed')return pause('Validation unavailable, cancelled or stale');if(driver.repeatedFailures>=2)return pause('Repeated identical validation failure');}
 if(driver.rounds>=driver.maxRounds)return pause('Round budget reached');return{kind:'run'};
}
