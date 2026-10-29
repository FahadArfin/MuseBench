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

export function queuedPrompt(task, action, {allowUnknown=false}={}) {
 if(!task||task.id!==action.taskId||task.archived)throw Error('Open the original active chat to change its queue.');
 const item=task.promptQueue?.find(entry=>entry.id===action.id);
 if(!item||!Number.isSafeInteger(action.expectedRevision)||action.expectedRevision<0||(item.revision??0)!==action.expectedRevision)throw Error('The queue changed. This request may have already started.');
 if(item.delivery==='sending'||item.delivery==='unknown'&&!allowUnknown)throw Error('This queued request has an unknown outcome. Check the session before creating another request.');
 return item;
}

export function editQueuedPrompt(task,action){
 const item=queuedPrompt(task,action);
 if(typeof action.text!=='string'||!action.text.trim()||action.text.length>16000||!['chat','plan'].includes(action.mode))throw Error('Use a prompt up to 16,000 characters and a valid conversation mode.');
 return {...item,text:action.text,mode:action.mode,revision:(item.revision??0)+1};
}
