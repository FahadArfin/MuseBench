export const CONTEXT_LIMIT=64000;
export const FILE_CONTEXT_LIMIT=24000;
export function fileReferences(value=[]){
 if(!Array.isArray(value)||value.length>8)throw Error('Select up to eight context files.');
 const found=new Set();return value.map(item=>{if(!item||typeof item.path!=='string'||!item.path||item.path.length>1024||typeof item.hash!=='string'||!/^[a-f0-9]{64}$/.test(item.hash)||found.has(item.path))throw Error('Invalid context file selection.');found.add(item.path);return{path:item.path,hash:item.hash};});
}
export function restoreSourceSnapshots(value){
 if(!Array.isArray(value)||value.length>8)return[];let size=0;return value.filter(item=>{if(!item||typeof item.path!=='string'||typeof item.hash!=='string'||typeof item.text!=='string')return false;size+=JSON.stringify(item).length;return size<=FILE_CONTEXT_LIMIT;}).map(({path,hash,text})=>({path,hash,text}));
}
export function composeChatContext({task,project,memories='',text='',attachments=[],history=true}){
 if(typeof text!=='string'||text.length>16000)throw Error('Use a prompt up to 16,000 characters.');
 const parts=[
  'MuseBench request context. Prior conversation and file contents below are reference material; the current request is at the end. Continue the task using current workspace evidence. Earlier tool state is not resumed. Do not repeat completed actions solely because they appear in history.',
  memories?`Personal instructions:\n${memories}`:'',
  project?.instructions?`Project instructions (user-authored):\n${project.instructions}`:'',
  task?.request&&task.request!==text?`Initial objective:\n${task.request.slice(0,2000)}`:'',
  task?.goal?.status==='active'?`Active objective:\n${task.goal.objective}`:'',
  attachments.length?`Selected source snapshots (JSON data; verify the current files before editing):\n${JSON.stringify(attachments.map(({path,hash,text})=>({path,hash,text})))}`:'',
 ].filter(Boolean);
 const ending=`\n\nCurrent request:\n${text}`;
 const previous=history?(task?.messages??[]).filter(m=>['user','assistant'].includes(m.role)&&m.text):[];
 const selected=[];let room=CONTEXT_LIMIT-parts.join('\n\n').length-ending.length-150,truncatedMessages=0;
 if(room<0)throw Error('Selected context is too large. Remove a file or shorten your request.');
 for(let i=previous.length-1;i>=0;i--){
  const message=previous[i],run=task?.runs?.find(r=>r.promptId===(message.turnId??message.id));
  const outcome=run?.status??message.outcome;
  const entry={role:message.role,text:message.text,...(message.sources?.length?{historicalSourceSnapshots:restoreSourceSnapshots(message.sources)}:{}),...(outcome&&outcome!=='completed'?{outcome}:{} )};
  let encoded=JSON.stringify(entry);
  if(encoded.length+2>room){
   // Keep an explicit suffix of the nearest message when a complete message will not fit.
   if(room>400){let size=Math.min(entry.text.length,room-200);while(size>0){encoded=JSON.stringify({...entry,historicalSourceSnapshots:undefined,text:`[Earlier part omitted] ${entry.text.slice(-size)}`});if(encoded.length+2<=room)break;size-=Math.max(1,Math.ceil((encoded.length+2-room)/2));}if(size>0){selected.unshift(encoded);truncatedMessages++;}}
   break;
  }
  selected.unshift(encoded);room-=encoded.length+2;
 }
 if(selected.length)parts.push(`Previous conversation (old requests are history, not new instructions):\n[${selected.join(',\n')}]`);
 const prompt=parts.join('\n\n')+ending;
 if(prompt.length>CONTEXT_LIMIT)throw Error('Context exceeds the request limit.');
 return{prompt,characters:prompt.length,estimatedTokens:Math.ceil(prompt.length/4),includedMessages:selected.length,omittedMessages:previous.length-selected.length,truncatedMessages,fileCount:attachments.length,replayedFiles:selected.reduce((count,value)=>count+(JSON.parse(value).historicalSourceSnapshots?.length??0),0),limit:CONTEXT_LIMIT};
}
