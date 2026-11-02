// Match an acknowledgement to this exact observed target, never just a truthy dispatch result.
export function matchingChildReceipt(state, input, previousIds = []) {
 if (state?.task?.id !== input.taskId || state?.runtime?.sessionId !== input.sessionId) return undefined;
 const previous = new Set(previousIds);
 return [...(state.runtime.childReceipts ?? []), ...(state.task.childControlReceipts ?? [])].find(r =>
  !previous.has(r.commandId) && r.sessionId === input.sessionId && r.itemId === input.itemId &&
  r.revision === input.revision && r.action === input.action && r.childId === input.childId &&
  r.attempt === input.attempt && (r.body ?? '') === (input.body ?? ''));
}
export function childTargetPending(runtime, itemId, child) {
 return (runtime.childReceipts ?? []).some(r => r.sessionId === runtime.sessionId && r.itemId === itemId &&
  r.childId === child?.childId && (['submitting', 'unknown'].includes(r.status) ||
  r.status === 'accepted' && r.action === 'retry' && r.attempt === child?.attempt));
}
export function childGroup(item) {
 return ['resultReady', 'closed'].includes(item.controlStatus) ||
  ['completed', 'failed', 'cancelled', 'interrupted'].includes(item.status) ? 'Done' : 'Active';
}
