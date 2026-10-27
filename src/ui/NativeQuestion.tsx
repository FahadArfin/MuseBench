import {useRef,useState} from 'react';
import {inputPrompt,validateInputAnswers,type InputAnswer} from '../shared/user-input.mjs';
import type {Action,AppState,RuntimeState} from '../shared/types';
import './native-question.css';

export function NativeQuestion({runtime,taskId,busy,act}:{runtime:RuntimeState;taskId:string;busy:boolean;act:(a:Action)=>Promise<AppState|null>}){
 const p=inputPrompt(runtime.pending);
 return p?<Question key={`${p.sessionId}:${p.userInputId}:${p.revision}`} prompt={p} runtime={runtime} taskId={taskId} busy={busy} act={act}/>:<p role="alert">This question cannot be displayed. Disconnect to stop the session.</p>;
}
function Question({prompt:p,runtime,taskId,busy,act}:{prompt:NonNullable<ReturnType<typeof inputPrompt>>;runtime:RuntimeState;taskId:string;busy:boolean;act:(a:Action)=>Promise<AppState|null>}){
 const [answers,setAnswers]=useState<Record<string,InputAnswer>>({}),[error,setError]=useState('');
 const engaged=useRef(false);
 const response=runtime.inputResponse,locked=busy||response?.userInputId===p.userInputId&&['submitting','accepted','unknown'].includes(response.status);
 const binding={taskId,sessionId:p.sessionId,userInputId:p.userInputId,turnId:p.turnId,revision:p.revision};
 const submit=async(operation:'answer'|'cancel')=>{const action={type:'answerInput' as const,...binding,operation,...(operation==='answer'?{answers:p.questions.map(q=>answers[q.id]).filter(Boolean)}:{})};try{validateInputAnswers(p,action);setError('');const next=await act(action);if(next?.error)setError(next.error);}catch(e){setError(e instanceof Error?e.message:String(e));}};
 return <section className="native-question" aria-label="Muse question" onFocusCapture={()=>{if(!engaged.current&&!locked){engaged.current=true;void act({type:'answerInput',...binding,operation:'engage'});}}}><h3>Muse has a question</h3>{p.questions.map(q=>{
 const a=answers[q.id],multiple=q.selection.mode==='multiple';
 return <fieldset key={q.id} disabled={locked}><legend>{q.question}</legend><div className="native-question-options">{q.options.map(o=><label key={o.label}><input type={multiple?'checkbox':'radio'} name={q.id} checked={multiple?a?.selectedLabels?.includes(o.label)??false:a?.selectedLabel===o.label} onChange={()=>{const selected=a?.selectedLabels??[];setAnswers({...answers,[q.id]:multiple?{questionId:q.id,selectedLabels:selected.includes(o.label)?selected.filter(l=>l!==o.label):[...selected,o.label]}:{questionId:q.id,selectedLabel:o.label}});}}/><span>{o.label}{o.description&&<small>{o.description}</small>}</span></label>)}</div>{multiple&&<small>Choose {q.selection.minSelections??1}–{q.selection.maxSelections??q.options.length} options, or write an answer.</small>}<textarea rows={2} maxLength={500} aria-label={`Write an answer: ${q.header}`} placeholder="Or write your own answer…" value={a?.freeText??''} onChange={e=>setAnswers({...answers,[q.id]:{questionId:q.id,freeText:e.target.value}})}/></fieldset>;
 })}{error&&<p role="alert">{error}</p>}{locked&&!busy&&<p role="status">{response?.status==='unknown'?'Answer outcome unknown. Wait for settlement or disconnect; it will not be sent again.':'Answer submitted. Waiting for Muse…'}</p>}<div className="modal-actions"><button className="button" disabled={locked} onClick={()=>void submit('cancel')}>Decline to answer</button><button className="button primary" disabled={locked} onClick={()=>void submit('answer')}>Send answers</button></div></section>;
}
