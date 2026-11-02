import assert from 'node:assert/strict';
// An elevated/locked hosted runner cannot prove desktop operation success. It
// must instead prove the production guard denies every operation before input.
export async function verifySessionDenial(call){
 const operations=['apps','windows','open','inspect','capture','click','type','key','scroll','drag'];
 for(const op of operations){
  const result=await call(op==='key'?{op,key:'Enter',modifiers:[]}:{op});
  assert.equal(result.ok,false,'Unavailable sessions must never allow '+op);
  assert.equal(result.error?.code,'session_unavailable','Expected the specific session guard for '+op);
  assert.equal(result.uncertain,false,'No input may have been dispatched for '+op);
  assert.deepEqual(Object.keys(result).sort(),['error','ok','uncertain'],'Session denial must not expose desktop data');
 }
 return{status:'passed',mode:'session-denial',desktopFunctionalCoverage:false,checks:operations.map(op=>op+' denied before desktop access or input')};
}
