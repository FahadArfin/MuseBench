import {useRef,useState} from 'react';
import {inputPrompt,validateInputAnswers,type InputAnswer} from '../shared/user-input.mjs';
import type {Action,AppState,RuntimeState} from '../shared/types';
import {QuestionMarkdown} from './QuestionMarkdown';
import './native-question.css';

export function NativeQuestion({runtime,taskId,busy,act}:{runtime:RuntimeState;taskId:string;busy:boolean;act:(a:Action)=>Promise<AppState|null>}){
 const p=inputPrompt(runtime.pending);
 return p?<Question key={`${p.sessionId}:${p.userInputId}:${p.revision}`} prompt={p} runtime={runtime} taskId={taskId} busy={busy} act={act}/>:<p role="alert">This question cannot be displayed. Disconnect to stop the session.</p>;
}
function Question({prompt:p,runtime,taskId,busy,act}:{prompt:NonNullable<ReturnType<typeof inputPrompt>>;runtime:RuntimeState;taskId:string;busy:boolean;act:(a:Action)=>Promise<AppState|null>}){
 const [answers,setAnswers]=useState<Record<string,InputAnswer>>({}),[error,setError]=useState('');
 const [custom,setCustom]=useState<Record<string,boolean>>({}),[submission,setSubmission]=useState<'sending'|'submitted'|'unknown'|null>(null);
 const engaged=useRef(false),sending=useRef(false),composing=useRef(false);
 const response=runtime.inputResponse,locked=busy||submission!==null||response?.userInputId===p.userInputId&&['submitting','accepted','unknown'].includes(response.status);
 const binding={taskId,sessionId:p.sessionId,userInputId:p.userInputId,turnId:p.turnId,revision:p.revision};
 const submit=async(operation:'answer'|'cancel')=>{
  if(locked||sending.current||composing.current)return;
  const action={type:'answerInput' as const,...binding,operation,...(operation==='answer'?{answers:p.questions.map(q=>answers[q.id]).filter(Boolean)}:{})};
  try{validateInputAnswers(p,action);}catch(e){setError(e instanceof Error?e.message:String(e));return;}
  sending.current=true;setSubmission('sending');setError('');
  try{
   const next=await act(action);
   if(next?.error){sending.current=false;setSubmission(null);setError(next.error);}
   else if(next){setSubmission('submitted');}
   else{setSubmission('unknown');setError('Could not confirm this response. Wait for Muse or disconnect before trying again.');}
  }catch{setSubmission('unknown');setError('Could not confirm this response. Wait for Muse or disconnect before trying again.');}
 };
 return <section className="native-question" aria-label="Muse question" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229&&!composing.current){event.preventDefault();void submit('answer');}
 }} onFocusCapture={()=>{if(!engaged.current&&!locked){engaged.current=true;void act({type:'answerInput',...binding,operation:'engage'}).catch(()=>{});}}}><h3>Muse has a question</h3>{p.questions.map(q=>{
 const a=answers[q.id],multiple=q.selection.mode==='multiple';
 return <fieldset key={q.id} aria-label={q.question} disabled={locked}><legend>{q.header}</legend><QuestionMarkdown text={q.question}/><div className="native-question-options">{q.options.map(o=><label key={o.label}><input type={multiple?'checkbox':'radio'} name={q.id} checked={!custom[q.id]&&(multiple?a?.selectedLabels?.includes(o.label)??false:a?.selectedLabel===o.label)} onChange={()=>{const selected=a?.selectedLabels??[];setCustom({...custom,[q.id]:false});setAnswers({...answers,[q.id]:multiple?{questionId:q.id,selectedLabels:selected.includes(o.label)?selected.filter(l=>l!==o.label):[...selected,o.label]}:{questionId:q.id,selectedLabel:o.label}});}}/><span><QuestionMarkdown text={o.label} inline/>{o.description&&<small><QuestionMarkdown text={o.description} inline/></small>}</span></label>)}</div>{multiple&&<small>Choose {q.selection.minSelections??1}–{q.selection.maxSelections??q.options.length} options, or write an answer.</small>}<button type="button" className={`question-custom ${custom[q.id]?'selected':''}`} aria-label={`Write my own answer: ${q.header}`} aria-expanded={!!custom[q.id]} onClick={()=>{setCustom({...custom,[q.id]:true});setAnswers({...answers,[q.id]:{questionId:q.id,freeText:a?.freeText??''}});}}>Write my own answer</button>{custom[q.id]&&<textarea rows={2} maxLength={500} aria-label={`Write an answer: ${q.header}`} placeholder="Your answer…" value={a?.freeText??''} onChange={e=>setAnswers({...answers,[q.id]:{questionId:q.id,freeText:e.target.value}})}/>}</fieldset>;
 })}{error&&<p role="alert">{error}</p>}{locked&&!busy&&<p role="status">{submission==='unknown'||response?.status==='unknown'?'Answer outcome unknown. Wait for settlement or disconnect; it will not be sent again.':submission==='sending'?'Sending response…':'Response submitted. Waiting for Muse…'}</p>}<div className="modal-actions"><button type="button" className="button" disabled={locked} onClick={()=>void submit('cancel')}>Decline to answer</button><button type="button" className="button primary" disabled={locked} onClick={()=>void submit('answer')}>Send answers</button></div><small className="question-keyboard-hint">Ctrl / ⌘ + Enter to send</small></section>;
}
