import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,ChevronUp,HelpCircle,Pencil} from 'lucide-react';
import {inputPrompt,validateInputAnswers,type InputAnswer} from '../shared/user-input.mjs';
import type {Action,AppState,RuntimeState} from '../shared/types';
import {QuestionMarkdown} from './QuestionMarkdown';
import './native-question.css';

type Props={runtime:RuntimeState;taskId:string;busy:boolean;act:(a:Action)=>Promise<AppState|null>;reveal?:number};
const identity=(p:NonNullable<ReturnType<typeof inputPrompt>>)=>JSON.stringify([p.sessionId,p.userInputId,p.revision]);
export function NativeQuestionDock({reveal,...props}:Omit<Props,'reveal'>&{reveal?:{userInputId:string;serial:number}}){
 const requests=(props.runtime.pendingRequests?.length?props.runtime.pendingRequests:[props.runtime.pending]).filter(p=>(p as {kind?:string})?.kind==='input');
 const [selection,setSelection]=useState({key:'',revealKey:'',serial:0}),consumedReveal=useRef<number|undefined>(undefined);
 const requested=requests.map(inputPrompt).find(p=>p?.userInputId===reveal?.userInputId),requestedKey=requested?identity(requested):'';
 useEffect(()=>{if(!reveal||consumedReveal.current===reveal.serial)return;consumedReveal.current=reveal.serial;if(requestedKey)setSelection({key:requestedKey,revealKey:requestedKey,serial:reveal.serial});},[reveal?.serial,requestedKey]);
 if(!requests.length)return null;
 const prompts=requests.map(inputPrompt),current=prompts.find(p=>p&&identity(p)===selection.key)??prompts[0];
 return <div className="native-question-dock" aria-label="Questions from Muse">
  <span className="sr-only" role="status">Muse has {requests.length===1?'a question':`${requests.length} question requests`} for you.</span>
  {requests.length>1&&<label className="question-request-picker">Pending questions<select aria-label="Pending questions" value={current?identity(current):''} onChange={e=>setSelection({key:e.target.value,revealKey:'',serial:0})}>{prompts.map((p,i)=>p&&<option key={identity(p)} value={identity(p)}>{i+1}. {p.questions[0].header}</option>)}</select></label>}
  {requests.map((request,i)=>{const p=prompts[i];return <div key={p?identity(p):`invalid-${i}`} hidden={p!==current} inert={p!==current}><NativeQuestion {...props} reveal={p&&p===current&&identity(p)===selection.revealKey?selection.serial:undefined} runtime={{...props.runtime,pending:request,inputResponse:props.runtime.inputResponses?.find(r=>r.userInputId===p?.userInputId)??props.runtime.inputResponse}}/></div>;})}
 </div>;
}
export function NativeQuestion({runtime,taskId,busy,act,reveal}:Props){
 const p=inputPrompt(runtime.pending);
 return p?<Question key={`${taskId}:${identity(p)}`} prompt={p} runtime={runtime} taskId={taskId} busy={busy} act={act} reveal={reveal}/>:<p role="alert">This question cannot be displayed. Disconnect to stop the session.</p>;
}
function Question({prompt:p,runtime,taskId,busy,act,reveal}:Props&{prompt:NonNullable<ReturnType<typeof inputPrompt>>}){
 const [answers,setAnswers]=useState<Record<string,InputAnswer>>({}),[error,setError]=useState(''),[collapsed,setCollapsed]=useState(false);
 const [submission,setSubmission]=useState<'sending'|'submitted'|'unknown'|null>(null);
 const engaged=useRef(false),sending=useRef(false),composing=useRef(false),formId=useId(),card=useRef<HTMLElement>(null);
 useEffect(()=>{if(!reveal)return;setCollapsed(false);const frame=requestAnimationFrame(()=>card.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[reveal]);
 const response=runtime.inputResponse,locked=busy||submission!==null||response?.userInputId===p.userInputId&&['submitting','accepted','unknown'].includes(response.status);
 const binding={taskId,sessionId:p.sessionId,userInputId:p.userInputId,turnId:p.turnId,revision:p.revision};
 const answerAction={type:'answerInput' as const,...binding,operation:'answer' as const,answers:p.questions.map(q=>answers[q.id]).filter(Boolean)};
 let complete=false;try{validateInputAnswers(p,answerAction);complete=true;}catch{/* Incomplete forms are not sent. */}
 const submit=async(operation:'answer'|'cancel')=>{
  if(locked||sending.current||composing.current)return;
  const action=operation==='answer'?answerAction:{type:'answerInput' as const,...binding,operation};
  try{validateInputAnswers(p,action);}catch(e){setError(e instanceof Error?e.message:String(e));return;}
  sending.current=true;setSubmission('sending');setError('');
  try{
   const next=await act(action);
   if(next?.error){sending.current=false;setSubmission(null);setError(next.error);}
   else if(next){setSubmission('submitted');}
   else{setSubmission('unknown');setError('Could not confirm this response. Wait for Muse or disconnect before trying again.');}
  }catch{setSubmission('unknown');setError('Could not confirm this response. Wait for Muse or disconnect before trying again.');}
 };
 return <section ref={card} tabIndex={-1} className="native-question" aria-label="Muse question" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229&&!composing.current){event.preventDefault();void submit('answer');}
 }} onFocusCapture={()=>{if(!engaged.current&&!locked){engaged.current=true;void act({type:'answerInput',...binding,operation:'engage'}).catch(()=>{});}}}>
  <header className="question-card-header"><h3><HelpCircle size={14}/>{p.questions.length===1?'Question':`${p.questions.length} questions`}</h3><button type="button" className="icon-button" aria-label={collapsed?'Expand question':'Collapse question'} aria-expanded={!collapsed} aria-controls={formId} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronDown size={15}/>:<ChevronUp size={15}/>}</button></header>
  <div id={formId} hidden={collapsed} inert={collapsed}>
   <div className="native-question-body">{p.questions.map(q=>{
    const a=answers[q.id],multiple=q.selection.mode==='multiple';
    return <fieldset key={q.id} aria-label={q.question} disabled={locked}>
     <legend className={p.questions.length===1?'sr-only':''}>{q.header}</legend><QuestionMarkdown text={q.question}/>
     <div className="native-question-options">{q.options.map((o,i)=>{const checked=multiple?a?.selectedLabels?.includes(o.label)??false:a?.selectedLabel===o.label;return <label key={o.label} className={checked?'selected':''}>
      <input type={multiple?'checkbox':'radio'} name={`${formId}:${q.id}`} checked={checked} onChange={()=>{const selected=a?.selectedLabels??[];setError('');setAnswers({...answers,[q.id]:multiple?{questionId:q.id,selectedLabels:selected.includes(o.label)?selected.filter(l=>l!==o.label):[...selected,o.label]}:{questionId:q.id,selectedLabel:o.label}});}}/>
      <span className="question-option-number" aria-hidden="true">{checked?<Check size={11}/>:i+1}</span><span className="question-option-copy"><QuestionMarkdown text={o.label} inline/>{o.description&&<small><QuestionMarkdown text={o.description} inline/></small>}</span>
     </label>;})}</div>
     {multiple&&<small>Choose {q.selection.minSelections??1}–{q.selection.maxSelections??q.options.length} options, or write an answer.</small>}
     <div className="question-custom-input"><Pencil size={14} aria-hidden="true"/><textarea rows={1} maxLength={500} aria-label={`Write an answer: ${q.header}`} placeholder="Or write your own response" value={a?.freeText??''} onChange={e=>{setError('');setAnswers({...answers,[q.id]:{questionId:q.id,freeText:e.target.value}});}}/></div>
    </fieldset>;
   })}</div>
   {error&&<p role="alert">{error}</p>}{locked&&!busy&&<p role="status">{submission==='unknown'||response?.status==='unknown'?'Answer outcome unknown. Wait for settlement or disconnect; it will not be sent again.':submission==='sending'?'Sending response…':'Response submitted. Waiting for Muse…'}</p>}
   <div className="question-actions"><small className="question-keyboard-hint">Ctrl / ⌘ + Enter to send</small><button type="button" className="question-skip" disabled={locked} onClick={()=>void submit('cancel')}>Skip</button><button type="button" className="question-send" aria-label="Send answers" disabled={locked||!complete} onClick={()=>void submit('answer')}>Send</button></div>
  </div>
 </section>;
}
