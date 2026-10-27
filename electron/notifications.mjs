export function validateNotificationPreferences(value) {
 const keys=['completion','attention','sound'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)||typeof value[key]!=='boolean'))throw Error('Invalid notification preferences.');
 return {completion:value.completion,attention:value.attention,sound:value.sound};
}

// Observe native run transitions only. The renderer cannot supply notification
// content, and restored terminal runs never produce a notification.
export function createRunNotifier({isFocused,send,report=()=>{}}) {
 let preferences={completion:false,attention:false,sound:false};
 const seen=new Map();
 return {
  configure(value){preferences=validateNotificationPreferences(value);},
  observe(state){
   for(const run of state.task?.runs??[]) {
    const key=`${state.task.id}:${run.id}`,previous=seen.get(key);
    seen.set(key,run.status);
    if(!previous||previous===run.status)continue;
    const completed=run.status==='completed',attention=['waiting','failed','interrupted'].includes(run.status);
    if(!completed&&!attention)continue;
    const delivery=status=>{try{report(run.id,status);}catch{}};
    if((!completed||!preferences.completion)&&(!attention||!preferences.attention)){delivery('suppressed');continue;}
    try {if(isFocused()){delivery('suppressed');continue;}delivery('submitted');send({title:'MuseBench',body:completed?'Muse Code finished a task.':run.status==='waiting'?'Muse Code needs your attention.':'A Muse Code task stopped. Open MuseBench for details.',silent:!preferences.sound},{id:run.id,delivery});}catch{delivery('failed');}
   }
   while(seen.size>300)seen.delete(seen.keys().next().value);
  },
 };
}
