import test from 'node:test';import assert from 'node:assert/strict';
import {inputPrompt,validateInputAnswers,validateInputAction} from '../src/shared/user-input.mjs';
import {validateAction} from '../electron/security.mjs';
const prompt={kind:'input',sessionId:'s',turnId:'t',userInputId:'u',revision:1,questions:[{id:'q',header:'Choice',question:'Choose',options:[{label:'A'},{label:'B'}],selection:{mode:'multiple',minSelections:1,maxSelections:2}}]};
const action={taskId:'task',sessionId:'s',turnId:'t',userInputId:'u',revision:1,operation:'answer',answers:[{questionId:'q',selectedLabels:['A','B']}]};
test('questions enforce current options, unique complete answers and text limits',()=>{
 assert.ok(inputPrompt(prompt));validateInputAnswers(prompt,action);validateInputAnswers(prompt,{...action,answers:[{questionId:'q',freeText:'An alternative'}]});
 for(const answers of [[],[{questionId:'q',selectedLabels:['A','A']}],[{questionId:'other',selectedLabels:['A']}],[{questionId:'q',selectedLabels:['C']}],[{questionId:'q',freeText:'x'.repeat(501)}],[{questionId:'q',freeText:'text',selectedLabels:['A']}]] )assert.throws(()=>validateInputAnswers(prompt,{...action,answers}));
 assert.equal(inputPrompt({...prompt,questions:[...prompt.questions,...prompt.questions]}),null);
});
test('question IPC requires current identity and excludes responses on cancel or engage',()=>{
 validateAction({type:'answerInput',...action});for(const key of ['taskId','sessionId','turnId','userInputId','revision']){const invalid={type:'answerInput',...action};delete invalid[key];assert.throws(()=>validateAction(invalid));}
 assert.throws(()=>validateInputAction({...action,operation:'cancel'}));validateInputAction({...action,answers:undefined,operation:'engage'});
});
