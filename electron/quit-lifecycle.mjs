/** A failed cleanup is not consent to abandon a process or unsaved storage. */
export function createQuitLifecycle({close,quit,onFailure=async()=> 'keep'}){
 let pending=null,confirmed=false;
 const finish=()=>{confirmed=true;quit();return true;};
 return {
  confirmed:()=>confirmed,
  request(){
   if(confirmed)return Promise.resolve(true);
   if(pending)return pending;
   pending=(async()=>{
    for(;;){
     try{await close();return finish();}
     catch{
      let choice;try{choice=await onFailure();}catch{return false;}
      if(choice==='force')return finish();
      if(choice!=='retry')return false;
     }
    }
   })().finally(()=>{pending=null;});
   return pending;
  },
 };
}
