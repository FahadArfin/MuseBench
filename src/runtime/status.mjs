const activeStatuses=new Set(['running','starting','submitting','connecting','checking-permissions']);

/** Fresh primitive lifecycle data; never inspect or copy transcript payloads. */
export function projectRuntimeStatus(state){
 if(!state||typeof state!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(state)))throw Error('Invalid runtime status response.');
 const {status=null,operationBusy,childrenBusy,cleanup=null,pending}=state;
 if(status!==null&&typeof status!=='string'||cleanup!==null&&typeof cleanup!=='string')throw Error('Invalid runtime status fields.');
 return{status,operationBusy:!!operationBusy,childrenBusy:!!childrenBusy,cleanup,pending:!!pending};
}

/** Legacy adapters remain supported, with one full read per observation. */
export function readRuntimeStatus(runtime){
 if(runtime?.statusSnapshot!==undefined){
  if(typeof runtime.statusSnapshot!=='function')throw Error('Invalid runtime status reader.');
  return projectRuntimeStatus(runtime.statusSnapshot());
 }
 return projectRuntimeStatus(runtime?.snapshot===undefined?{}:runtime.snapshot());
}

export function runtimeStatusBusy(state){
 return activeStatuses.has(state.status)||state.operationBusy||state.childrenBusy||state.cleanup==='unconfirmed'||state.pending;
}
