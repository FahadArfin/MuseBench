// Window lifetime must not decide subprocess lifetime. Detached services stay
// owned until their own terminal observation confirms cleanup.
export function createServiceOwners(){
 const records=new Map();
 const busy=owner=>{try{return !!owner.isBusy();}catch{return true;}};
 const close=owner=>{
  const record=records.get(owner);if(!record)return Promise.resolve();
  record.closing=true;
  return Promise.resolve().then(()=>owner.close()).finally(()=>{if(!busy(owner))records.delete(owner);});
 };
 return {
  add(owner){records.set(owner,{closing:false});return owner;},
  isBusy(){let active=false;for(const [owner,record] of records){if(busy(owner))active=true;else if(record.closing)records.delete(owner);}return active;},
  close,
  async closeAll(){const results=await Promise.allSettled([...records.keys()].map(close));if(results.some(result=>result.status==='rejected'))throw Error('Sign-in cleanup could not be confirmed.');},
 };
}
