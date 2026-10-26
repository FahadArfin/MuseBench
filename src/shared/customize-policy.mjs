const active=new Set(['running','starting','submitting','connecting','checking-permissions']);
export function customizeBlocked(...states){return states.some(state=>Boolean(state&&(state.busy||active.has(state.runtime?.status)||state.runtime?.pending||['pending','unconfirmed'].includes(state.runtime?.cleanup))));}
