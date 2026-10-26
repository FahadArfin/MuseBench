export const REASONING_LEVELS = Object.freeze(['none','minimal','low','medium','high','xhigh','max','ultra']);
export const APPROVAL_MODES = Object.freeze(['ask','auto','never']);
export const DEFAULT_RUN_OPTIONS = Object.freeze({reasoning:'high',approval:'ask'});
export function validateRunOptions(value = DEFAULT_RUN_OPTIONS) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!['reasoning','approval'].includes(key)) || !REASONING_LEVELS.includes(value.reasoning) || !APPROVAL_MODES.includes(value.approval)) throw Error('Invalid reasoning or approval options.');
  return {reasoning:value.reasoning,approval:value.approval};
}
export function restoreRunOptions(value) { try { return validateRunOptions(value); } catch { return {...DEFAULT_RUN_OPTIONS}; } }
export function approvalArguments(approval) {
  if (approval==='ask') return ['--permission-profile',':ask-me'];
  if (approval==='auto') return ['--permission-profile',':auto-review'];
  if (approval==='never') return ['--approval-mode','never','--approval-judge','off'];
  throw Error('Invalid approval option.');
}
