export function moveQueuedPrompt(task, action) {
 if (!task || task.id !== action.taskId || task.archived) throw Error('Open the original active chat to reorder its queue.');
 const queue = task.promptQueue ?? [];
 const item = queue.find(entry => entry.id === action.id);
 if (!item || action.beforeId !== null && !queue.some(entry => entry.id === action.beforeId)) throw Error('The queue changed. A prompt may have already started; try again.');
 if (action.id === action.beforeId) return queue;
 const remaining = queue.filter(entry => entry.id !== action.id);
 const index = action.beforeId === null ? remaining.length : remaining.findIndex(entry => entry.id === action.beforeId);
 return [...remaining.slice(0, index), item, ...remaining.slice(index)];
}
