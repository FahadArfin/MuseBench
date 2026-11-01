export const DICTATION_RECOVERY_KEY='musebench:dictation-recovery:v1';
const loadError='Saved extra speech could not be loaded. Retry recovery before using dictation.';
const saveError='Extra speech could not be saved. Copy it before closing this window, or retry saving.';
const sizeError='Extra speech exceeds the space reserved for recovery. Copy it before closing this window, add it to messages, or discard it.';
const join=parts=>parts.reduce((text,part)=>text+(text&&part&&!/\s$/.test(text)&&!/^\s/.test(part)?' ':'')+part,'');
// These limits bound the data this feature writes, independently of the origin's
// remaining quota. A failed write leaves the previous durable snapshot intact.
export function createDictationRecovery({storage=()=>window.localStorage,legacyStorage=()=>window.sessionStorage,maxChatChars=262144,maxTotalChars=1048576,maxChats=128}={}){
 const owners=new Map(),listeners=new Set();let id=0,loaded=false,readReady=false,problem='',lastSaved=null,legacyImported=false;
 const text=context=>join([...(owners.get(context)?.values()??[])].map(entry=>entry.text).filter(Boolean));
 const retain=(context,value)=>{const entry={text:value},entries=owners.get(context)??new Map();entries.set(++id,entry);owners.set(context,entries);return entry;};
 const records=()=>Object.fromEntries([...owners.keys()].map(context=>[context,text(context)]).filter(([,value])=>value));
 const parse=(raw,legacy=false)=>{
  if(raw===null)return{};const value=JSON.parse(raw),result=legacy?value:value?.version===1?value.records:null;
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Invalid recovery data.');
  for(const [context,value] of Object.entries(result))if(!context||context.length>512||typeof value!=='string')throw Error('Invalid recovery owner.');
  return result;
 };
 const emit=()=>{for(const listener of listeners)listener();};
 function persist(){
  if(!readReady)return;
  const next=records(),values=Object.values(next);
  if(values.length>maxChats||values.some(value=>value.length>maxChatChars)||values.reduce((sum,value)=>sum+value.length,0)>maxTotalChars||Object.keys(next).some(context=>context.length>512)){problem=sizeError;return;}
  const encoded=values.length?JSON.stringify({version:1,records:next}):null;
  try{
   if(encoded!==lastSaved){const target=storage();if(encoded===null)target.removeItem(DICTATION_RECOVERY_KEY);else target.setItem(DICTATION_RECOVERY_KEY,encoded);lastSaved=encoded;}
   problem='';
   // The durable envelope is authoritative after a successful migration. An old
   // session buffer must not resurrect explicitly discarded or reinserted text.
   try{legacyStorage().removeItem(DICTATION_RECOVERY_KEY);}catch{}
  }catch{problem=saveError;}
 }
 function load(force=false){
  if(loaded&&!force)return;loaded=true;
  try{
   const raw=storage().getItem(DICTATION_RECOVERY_KEY),saved=parse(raw);lastSaved=raw;
   for(const [context,value] of Object.entries(saved))if(!owners.has(context))retain(context,value);
   readReady=true;problem='';
   if(raw===null&&!legacyImported){
    const legacy=legacyStorage().getItem(DICTATION_RECOVERY_KEY),pending=parse(legacy,true);legacyImported=true;
    for(const [context,value] of Object.entries(pending))if(!owners.has(context))retain(context,value);
   }
   persist();
  }catch{readReady=false;problem=loadError;}
 }
 return{load,text,error:()=>problem,retain,remove:context=>{owners.set(context,new Map());},prune:context=>{const entries=owners.get(context);if(entries)for(const [key,entry] of entries)if(!entry.text)entries.delete(key);},flush(){load();persist();emit();},retry(){load(true);persist();emit();},subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
}
