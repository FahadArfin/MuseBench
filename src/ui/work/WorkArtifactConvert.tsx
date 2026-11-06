import {useEffect,useRef,useState} from 'react';
import type {WorkArtifact} from '../../shared/work-types';

/** Only the explicitly selected legacy chart/table crosses this copy boundary. */
export function WorkArtifactConvert({itemId,artifact,onCreated,onError,disabled=false}:{itemId:string;artifact:WorkArtifact;onCreated:(itemId:string)=>void;onError?:(message:string)=>void;disabled?:boolean}){
 const initial=artifact.charts.length?'chart:0':'table';
 const [selection,setSelection]=useState(initial),[targetKind,setTargetKind]=useState<'slides'|'document'|'design'>('slides'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=useRef(itemId);current.current=itemId;
 useEffect(()=>{current.current=itemId;setSelection(artifact.charts.length?'chart:0':'table');setError('');setBusy(false);return()=>{if(current.current===itemId)current.current='';};},[itemId]);
 const dashboard=artifact.kind==='dashboard';
 if(dashboard&&!artifact.charts.length&&!artifact.table)return null;
 const copy=async()=>{
  if(busy||disabled)return;const originalId=itemId;setBusy(true);setError('');
  try{
   const content=selection==='table'?{type:'table' as const}:{type:'chart' as const,index:Number(selection.slice(6))};
   const bridge=window.musebench;if(!bridge?.workStudio)throw Error('Creative Work is unavailable. Reopen the desktop app to reconnect.');
   const result=await bridge.workStudio(dashboard?{type:'convertArtifact',itemId:originalId,selection:content,targetKind}:{type:'convertLegacy',itemId:originalId});
   if(result?.error)throw Error(result.error);
   if(!result?.itemId||result.itemId===originalId)throw Error('The editable copy was not created independently.');
   if(current.current===originalId)onCreated(result.itemId);
  }catch(caught){if(current.current===originalId){const message=caught instanceof Error?caught.message:'The selected content could not be copied.';setError(message);onError?.(message);}}
  finally{if(current.current===originalId)setBusy(false);}
 };
 if(!dashboard)return <details className="work-artifact-convert"><summary>Make this artifact editable</summary><div style={{padding:'12px 0'}}><p>This creates an independent {artifact.kind==='slides'?'presentation':artifact.kind==='motion'?'motion project':'document'} from the saved artifact. Your original stays available.</p><p>{artifact.kind==='slides'?'Text, charts and tables become editable objects. The legacy preview layout may differ; review slide layout and notes before exporting.':artifact.kind==='motion'?'Scene timing and text become editable motion objects. Decorative animation is approximated; summary, metrics, tables and sections may remain only in the original artifact and conversion report. Review playback before exporting.':'Text, charts and tables become structured editable blocks. Pagination and styling may differ; review pages before exporting.'}</p><small>Visible source annotations are included. Private chat and attached input files are excluded.</small><p><button className="studio-button" disabled={busy||disabled} onClick={()=>void copy()}>{busy?'Creating editable copy…':'Open editable copy'}</button></p>{error&&<p role="alert">{error}</p>}</div></details>;
 return <details className="work-artifact-convert"><summary>Copy chart or table to an editor</summary><form aria-label="Copy dashboard content" onSubmit={event=>{event.preventDefault();void copy();}} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end',padding:'12px 0'}}>
  <label>Content<select aria-label="Dashboard content to copy" value={selection} disabled={busy||disabled} onChange={event=>setSelection(event.target.value)}>{artifact.charts.map((chart,index)=><option key={index} value={`chart:${index}`}>Chart: {chart.title}</option>)}{artifact.table&&<option value="table">Underlying data table</option>}</select></label>
  <label>Make a<select aria-label="Editable copy format" value={targetKind} disabled={busy||disabled} onChange={event=>setTargetKind(event.target.value as typeof targetKind)}><option value="slides">Presentation slide</option><option value="document">Document</option><option value="design">Design</option></select></label>
  <button type="submit" className="studio-button" disabled={busy||disabled}>{busy?'Creating copy…':'Create editable copy'}</button>
  <small style={{flexBasis:'100%'}}>Copies the selected values and visible source notes into a new project. Changes to either project stay independent. Private chat and attached input files are excluded.</small>
  {error&&<p role="alert" style={{flexBasis:'100%'}}>{error}</p>}
 </form></details>;
}
