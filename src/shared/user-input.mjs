const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
export function inputPrompt(value){
 if(!value||value.kind!=='input'||!['sessionId','userInputId','turnId'].every(k=>text(value[k],200))||!Array.isArray(value.questions)||value.questions.length<1||value.questions.length>3)return null;
 const ids=new Set();
 for(const q of value.questions){if(!q||!text(q.id,64)||ids.has(q.id)||!text(q.header,12)||!text(q.question,4000)||!Array.isArray(q.options)||q.options.length<2||q.options.length>3||!['single','multiple'].includes(q.selection?.mode))return null;ids.add(q.id);
  if(q.options.some(o=>!o||!text(o.label,80)||o.description!==undefined&&!text(o.description,240))||new Set(q.options.map(o=>o.label)).size!==q.options.length)return null;
  if(q.selection.mode==='multiple'){const min=q.selection.minSelections??1,max=q.selection.maxSelections??q.options.length;if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>q.options.length)return null;}
 }
 return value;
}
export function validateInputAction(action){
 if(!action||!['sessionId','userInputId','turnId'].every(k=>text(action[k],200))||!Number.isInteger(action.revision)||action.revision<1||!['answer','cancel','engage'].includes(action.operation))throw Error('Invalid question response.');
 if(action.operation!=='answer'){if(action.answers!==undefined)throw Error('Cancellation cannot include answers.');return;}
 if(!Array.isArray(action.answers)||action.answers.length<1||action.answers.length>3)throw Error('Answer every question.');
 for(const a of action.answers){if(!a||!text(a.questionId,64)||Object.keys(a).some(k=>!['questionId','selectedLabel','selectedLabels','freeText'].includes(k))||['selectedLabel','selectedLabels','freeText'].filter(k=>a[k]!==undefined).length!==1)throw Error('Invalid answer.');
  if(a.freeText!==undefined&&!text(a.freeText,500)||a.selectedLabel!==undefined&&!text(a.selectedLabel,80)||a.selectedLabels!==undefined&&(!Array.isArray(a.selectedLabels)||!a.selectedLabels.length||a.selectedLabels.length>3||a.selectedLabels.some(v=>!text(v,80))||new Set(a.selectedLabels).size!==a.selectedLabels.length))throw Error('Invalid answer text or selection.');
 }
}
export function validateInputAnswers(prompt,action){
 validateInputAction(action);if(!inputPrompt(prompt))throw Error('This question cannot be displayed safely. Disconnect to stop.');
 if(action.operation!=='answer')return;
 if(action.answers.length!==prompt.questions.length||new Set(action.answers.map(a=>a.questionId)).size!==prompt.questions.length)throw Error('Answer every question once.');
 for(const q of prompt.questions){const a=action.answers.find(a=>a.questionId===q.id);if(!a)throw Error('Unknown question.');if(a.freeText!==undefined)continue;
  const labels=q.options.map(o=>o.label);if(q.selection.mode==='single'){if(!labels.includes(a.selectedLabel))throw Error('Choose a current option.');}
  else if(!a.selectedLabels||a.selectedLabels.length<(q.selection.minSelections??1)||a.selectedLabels.length>(q.selection.maxSelections??labels.length)||a.selectedLabels.some(l=>!labels.includes(l)))throw Error('Choose the required number of current options.');
 }
}
export function confirmedInputText(receipt){
 if(receipt?.status!=='settled'||receipt.outcome!=='answered')return null;
 const prompt=inputPrompt(receipt.prompt);if(!prompt)return null;
 try{validateInputAnswers(prompt,{...prompt,revision:1,operation:'answer',answers:receipt.confirmedAnswers});}catch{return null;}
 return prompt.questions.map(q=>{const answer=receipt.confirmedAnswers.find(a=>a.questionId===q.id);return `${q.question}\nMy answer: ${answer.freeText??answer.selectedLabel??answer.selectedLabels.join(', ')}`;}).join('\n\n');
}
