import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChevronRight,FileText,RefreshCw} from 'lucide-react';
import type {CustomizeCommand,ProjectInstructionInspection,ProjectInstructionReview} from '../shared/customize-types';
import {MotionDisclosure} from './MotionDisclosure';
import './project-instructions.css';

function SourcePreview({name,label,children}:{name:string;label:string;children:ReactNode}){
 const [open,setOpen]=useState(false),id=useId();
 return <div className="instruction-source"><button type="button" className="instruction-toggle" aria-label={label} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><ChevronRight size={13} className={open?'open':''}/><span>{name}</span></button><MotionDisclosure open={open} id={id} unmountWhenClosed><pre>{children}</pre></MotionDisclosure></div>;
}

type Props={review:ProjectInstructionReview|null;disabled:boolean;busy:boolean;reviewed:boolean;setReviewed:(value:boolean)=>void;execute:(command:CustomizeCommand)=>Promise<void>};
export function ProjectInstructions({review,disabled,busy,reviewed,setReviewed,execute}:Props){
 const [open,setOpen]=useState(false),[data,setData]=useState<ProjectInstructionInspection>(),[loading,setLoading]=useState(false),[error,setError]=useState(''),[showReview,setShowReview]=useState(false);
 const id=useId(),reviewId=useId(),alive=useRef(true),sequence=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
 async function refresh(){
  const ticket=++sequence.current;setData(undefined);setError('');setLoading(true);setReviewed(false);
  try{
   if(!window.musebench)throw Error('Open MuseBench to inspect project instructions.');
   const result=await window.musebench.customize({type:'inspectProject'});
   if(!result.projectInstructions)throw Error('Instruction inspection is unavailable.');
   if(alive.current&&ticket===sequence.current)setData(result.projectInstructions);
  }catch(err){if(alive.current&&ticket===sequence.current)setError(String(err instanceof Error?err.message:err).replace(/^Error invoking remote method '[^']+': Error: /,''));}
  finally{if(alive.current&&ticket===sequence.current)setLoading(false);}
 }
 // A review/approval result invalidates the previous observation without fetching on renders.
 useEffect(()=>{if(review){sequence.current++;setLoading(false);setData(undefined);setError('');}},[review]);
 const matchingReview=review&&data?.root===review.root;
 return <section className="project-instructions" aria-label="Project instruction inspector">
  <button type="button" className="instruction-toggle instruction-heading" aria-label="Project instructions" aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(!open);if(!open&&!data&&!loading)void refresh();}}><FileText size={15}/><strong>Project instructions</strong><span>Rules, precedence &amp; review</span><ChevronRight size={14} className={open?'open':''}/></button>
  <MotionDisclosure open={open} id={id}>
   <div className="instruction-body">
    <div className="instruction-toolbar"><span>{data?.simulation?'Preview sample':data?`Checked ${new Date(data.checkedAt).toLocaleTimeString()}`:'Inspect the current project'}</span><button type="button" className="icon-button" aria-label="Refresh project instructions" title="Refresh project instructions" disabled={loading||busy} onClick={()=>void refresh()}><RefreshCw size={14} className={loading?'spin':''}/></button></div>
    {loading&&<p role="status">Reading project rules…</p>}{error&&<p role="alert">{error}</p>}
    {data&&<>
     <p className="instruction-total">{data.selectedCount} selected {data.selectedCount===1?'file':'files'} · {data.selectedBytes===null?'Size incomplete':`${data.selectedBytes.toLocaleString()} bytes`}</p>
     <p>Documented selection for the next Muse session. Deeper project rules take precedence. Personal rules, skills and memory are excluded from these sizes.</p>
     <div className="instruction-trust"><strong>{data.trust.status==='reviewed'?'Project review current':data.trust.status==='required'?'Review required':'Trust unavailable'}</strong><span>{data.trust.status==='reviewed'?'Files matched the saved review when checked.':data.trust.status==='required'?'MuseBench will not enable project rules until reviewed.':data.trust.reason}</span></div>
     <p className="instruction-path">{data.boundary.kind==='git'?'Git boundary':data.boundary.kind==='filesystem'?'Filesystem boundary':'Hierarchy incomplete'}: {data.boundary.root}</p>
     {!data.complete&&<p role="status">Some paths could not be fully inspected. Refresh after resolving the notes below.{data.selectedBytes===null?` ${data.measuredBytes.toLocaleString()} bytes measured; complete size unknown.`:''}</p>}
     {data.selectedCount===0&&data.complete&&<p>No project instruction files found.</p>}
     <ol className="instruction-levels">{data.levels.filter(level=>level.files.length||level.issue).map(level=><li key={level.root}><div className="instruction-path">{level.root}</div>{level.issue&&<p>{level.issue}</p>}{level.files.map(file=><article key={file.path} className="instruction-file"><div className="instruction-file-row"><span>{file.path}</span><small>{file.selected?(file.issue?'Selection unverified':'Selected at this level'):`Shadowed by ${file.shadowedBy}`}</small><small>{file.bytes===undefined?'Size unknown':`${file.bytes.toLocaleString()} bytes`}</small></div>{file.issue&&<p>{file.issue}</p>}{file.text!==undefined&&<SourcePreview name="Read file" label={`Read ${file.path} in ${level.root}`}>{file.text||'(Empty file)'}</SourcePreview>}</article>)}</li>)}</ol>
    </>}
    <button type="button" className="instruction-toggle instruction-review-toggle" aria-expanded={showReview} aria-controls={reviewId} onClick={()=>setShowReview(!showReview)}><ChevronRight size={13} className={showReview?'open':''}/><span>Project trust review</span></button>
    <MotionDisclosure open={showReview} id={reviewId}>
     <p>The review includes project skills and configuration as well as instruction files. Changes require review again. Native project hook files and project MCP stay disabled; app-owned hooks are configured in Hooks.</p>
     <button className="button" disabled={disabled||loading||data?.trust.status==='unavailable'} onClick={()=>void execute({type:'reviewProject'})}>Review project instructions</button>
     {review&&<div className="instruction-review"><p className="instruction-path">{review.root}<br/>SHA-256: {review.fingerprint}</p>{review.files.map(file=><SourcePreview key={`${review.fingerprint}:${file.path}`} name={file.path} label={`Review source ${file.path}`}>{file.text}</SourcePreview>)}{review.reviewed?<><p>Files matched the saved review when opened.</p><button className="button" disabled={disabled} onClick={()=>void execute({type:'revokeProject',root:review.root})}>Revoke project trust</button></>:<><label className="extensions-consent"><input type="checkbox" checked={reviewed} disabled={disabled} onChange={event=>setReviewed(event.target.checked)}/>I trust these project instructions.</label><button className="button" disabled={disabled||!reviewed||!review.files.length||!!data&&!matchingReview} onClick={()=>void execute({type:'approveProject',root:review.root,fingerprint:review.fingerprint,reviewed:true})}>Trust reviewed instructions</button></>}</div>}
    </MotionDisclosure>
   </div>
  </MotionDisclosure>
 </section>;
}
