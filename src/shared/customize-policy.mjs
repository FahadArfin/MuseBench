const active=new Set(['running','starting','submitting','connecting','checking-permissions']);
export function customizeBlocked(...states){return states.some(state=>Boolean(state&&(state.busy||state.tasks?.some(t=>t.runtimeBusy||active.has(t.runtimeStatus))||active.has(state.runtime?.status)||state.runtime?.pending||['pending','unconfirmed'].includes(state.runtime?.cleanup))));}
