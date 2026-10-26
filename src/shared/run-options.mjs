export const RUN_BUDGETS = Object.freeze({standard:Object.freeze({label:'Standard',minutes:3,steps:8}),extended:Object.freeze({label:'Extended',minutes:15,steps:32}),deep:Object.freeze({label:'Deep',minutes:45,steps:96})});
export function runBudget(id='standard'){if(!Object.hasOwn(RUN_BUDGETS,id))throw Error('Invalid task budget.');return {...RUN_BUDGETS[id]};}
export const REASONING_LEVELS = Object.freeze(['none','minimal','low','medium','high','xhigh','max','ultra']);
export const APPROVAL_MODES = Object.freeze(['ask','auto','never']);
export const DEFAULT_RUN_OPTIONS = Object.freeze({reasoning:'high',approval:'ask'});
export function validateRunOptions(value = DEFAULT_RUN_OPTIONS) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!['reasoning','approval','budget','model'].includes(key)) || !REASONING_LEVELS.includes(value.reasoning) || !APPROVAL_MODES.includes(value.approval)) throw Error('Invalid reasoning or approval options.');
  if(Object.hasOwn(value,'model')&&(typeof value.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value.model)))throw Error('Invalid model id.');
  if(Object.hasOwn(value,'budget'))runBudget(value.budget);
  return {...(value.model?{model:value.model}:{}),reasoning:value.reasoning,approval:value.approval,...(Object.hasOwn(value,'budget')?{budget:value.budget}:{})};
}
export function restoreRunOptions(value) { try { return validateRunOptions(value); } catch { return {...DEFAULT_RUN_OPTIONS}; } }
export function approvalArguments(approval) {
  if (approval==='ask') return ['--permission-profile',':ask-me'];
  if (approval==='auto') return ['--permission-profile',':auto-review'];
  if (approval==='never') return ['--approval-mode','never','--approval-judge','off'];
  throw Error('Invalid approval option.');
}
