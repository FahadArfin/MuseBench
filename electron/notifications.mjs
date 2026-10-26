export function validateNotificationPreferences(value) {
 const keys=['completion','attention','sound'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)||typeof value[key]!=='boolean'))throw Error('Invalid notification preferences.');
 return {completion:value.completion,attention:value.attention,sound:value.sound};
}

// Observe native run transitions only. The renderer cannot supply notification
// content, and restored terminal runs never produce a notification.
export function createRunNotifier({isFocused,send}) {
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
    if((!completed||!preferences.completion)&&(!attention||!preferences.attention))continue;
    try {if(!isFocused())send({title:'MuseBench',body:completed?'Muse Code finished a task.':run.status==='waiting'?'Muse Code needs your attention.':'A Muse Code task stopped. Open MuseBench for details.',silent:!preferences.sound});}catch{/* OS notification failures must not affect a coding run. */}
   }
   while(seen.size>300)seen.delete(seen.keys().next().value);
  },
 };
}
