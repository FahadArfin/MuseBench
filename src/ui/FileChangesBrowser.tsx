import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {ChevronDown,ChevronRight,Code2,File,Folder,FolderOpen,LoaderCircle,RefreshCw,Search} from 'lucide-react';
import type {Action,AppState,Task,WorkRun} from '../shared/types';
import type {FileReviewFile,FileReviewInspection,FileReviewPage,FileReviewView} from '../shared/file-review.mjs';
import {FileDiffView} from './FileDiffView';
import {buildReviewTree,parentReviewPaths,type ReviewTreeNode} from './file-review-tree';
import './file-changes-browser.css';

export interface FileChangesBrowserProps {
 task:Task;
 selectedRunId?:string;
 selectedScope?:'run'|'all';
 selectedFilePath?:string;
 onSelectFilePath?:(path:string)=>void;
 act?:(action:Action)=>Promise<AppState|null>;
 onDraft?:(text:string)=>void;
 onReviewPrompt?:(runId:string)=>void;
}
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const latestRun=(task:Task)=>[...(task.runs??[])].reverse().find(run=>!['queued','working','waiting'].includes(run.status))??task.runs?.at(-1);
const TREE_PAGE_SIZE=200;
function runLabel(run:WorkRun|undefined,id:string){return run?(run.prompt??'').replace(/\s+/g,' ').trim().slice(0,92)||'Prompt '+id.slice(0,8):'Captured prompt '+id.slice(0,8);}
function Counts({additions,deletions,unknown=false}:{additions:number;deletions:number;unknown?:boolean}){
 return <span className="file-review-counts" title={unknown?'Some files do not have line counts. Totals include counted files.':`${additions} additions, ${deletions} deletions`} aria-label={unknown?`${additions} known additions, ${deletions} known deletions; some counts unavailable`:`${additions} additions, ${deletions} deletions`}><span className="file-review-added">+{unknown&&!additions?'…':additions}</span><span className="file-review-removed">−{unknown&&!deletions?'…':deletions}</span>{unknown&&(additions>0||deletions>0)&&<span>…</span>}</span>;
}

export function FileChangesBrowser({task,selectedRunId,selectedScope,selectedFilePath,onSelectFilePath,onReviewPrompt}:FileChangesBrowserProps){
 const [scope,setScope]=useState<'run'|'all'>(selectedScope??'run'),[runId,setRunId]=useState(selectedRunId??latestRun(task)?.promptId??''),[path,setPath]=useState(selectedFilePath??'');
 const [showAll,setShowAll]=useState(false),[query,setQuery]=useState(''),[expanded,setExpanded]=useState<Set<string>>(new Set()),[focusPath,setFocusPath]=useState('');
 const [refresh,setRefresh]=useState(0),[view,setView]=useState<{key:string;value:FileReviewView}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [version,setVersion]=useState(''),[historyView,setHistoryView]=useState<{key:string;value:FileReviewView}|null>(null),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState('');
 const [cursors,setCursors]=useState<string[]>([]),[page,setPage]=useState<{key:string;value:FileReviewPage}|null>(null),[pageLoading,setPageLoading]=useState(false),[pageError,setPageError]=useState(''),[retry,setRetry]=useState(0);
 const [opening,setOpening]=useState(false),[openError,setOpenError]=useState(''),[notice,setNotice]=useState('');
 const [knownCounts,setKnownCounts]=useState<{key:string;files:Record<string,{additions:number;deletions:number}>}>({key:'',files:{}});
 const [treePages,setTreePages]=useState<{key:string;offsets:Record<string,number>}>({key:'',offsets:{}});
 const tree=useRef<HTMLUListElement>(null),previousTask=useRef(task.id),previousRunProp=useRef(selectedRunId),previousScopeProp=useRef(selectedScope),previousFileProp=useRef(selectedFilePath);
 const inspection:FileReviewInspection={taskId:task.id,scope,...(scope==='run'?{runId}:{})},inspectionKey=task.id+':'+scope+':'+(scope==='run'?runId:'')+':'+refresh;
 const currentInspection=useRef(inspectionKey);currentInspection.current=inspectionKey;
 const fileSelectionKey=task.id+':'+path,currentFileSelection=useRef(fileSelectionKey);currentFileSelection.current=fileSelectionKey;
 const data=view?.key===inspectionKey?view.value:null;
 const files=data?.files??[],selected=files.find(file=>file.path===path);
 const countsKey=task.id+':'+scope+':'+(scope==='run'?runId:'')+':'+(data?.revision??'');
 const historyKey=inspectionKey+':'+path+':'+version,currentHistory=useRef(historyKey);currentHistory.current=historyKey;
 const historical=version&&historyView?.key===historyKey?historyView.value:null;
 const comparison=version?historical:data,comparisonFile=comparison?.files.find(file=>file.path===path);
 const cursor=cursors.at(-1),comparisonKey=historyKey+':'+(comparison?.revision??'')+':'+(cursor??'')+':'+retry;
 const currentComparison=useRef(comparisonKey);currentComparison.current=comparisonKey;
 const currentPage=page?.key===comparisonKey?page.value:null;

 useEffect(()=>{
  if(previousTask.current!==task.id){previousTask.current=task.id;setScope(selectedScope??'run');setRunId(selectedRunId??latestRun(task)?.promptId??'');setPath(selectedFilePath??'');setExpanded(new Set());setQuery('');setShowAll(false);setVersion('');setCursors([]);setOpenError('');setNotice('');}
  if(previousRunProp.current!==selectedRunId){previousRunProp.current=selectedRunId;if(selectedRunId){setRunId(selectedRunId);setScope(selectedScope??'run');setVersion('');setCursors([]);}}
  if(previousScopeProp.current!==selectedScope){previousScopeProp.current=selectedScope;if(selectedScope){setScope(selectedScope);setVersion('');setCursors([]);}}
  if(previousFileProp.current!==selectedFilePath){previousFileProp.current=selectedFilePath;if(selectedFilePath){setPath(selectedFilePath);setVersion('');setCursors([]);}}
 },[task.id,selectedRunId,selectedScope,selectedFilePath]);
 useEffect(()=>{if(!runId){const latest=latestRun(task);if(latest)setRunId(latest.promptId);}},[runId,task.runs]);

 useEffect(()=>{
  let active=true;setLoading(true);setError('');setCursors([]);setView(null);
  if(scope==='run'&&!runId){setLoading(false);return()=>{active=false;};}
  void (async()=>{try{
   if(!window.musebench?.inspectFileReview)throw Error('File review is unavailable in this app version.');
   const result=await window.musebench.inspectFileReview(inspection);
   if(!active||currentInspection.current!==inspectionKey)return;
   if(result.taskId!==task.id||result.scope!==scope||(scope==='run'&&result.runId!==runId))throw Error('The file review belongs to a different selection. Refresh to try again.');
   setView({key:inspectionKey,value:result});
   setPath(before=>result.files.some(file=>file.path===before)?before:(result.files.find(file=>file.status!=='unchanged')??result.files[0])?.path??'');
  }catch(error){if(active&&currentInspection.current===inspectionKey)setError(errorText(error));}finally{if(active&&currentInspection.current===inspectionKey)setLoading(false);}})();
  return()=>{active=false;};
 },[inspectionKey]);

 useEffect(()=>{setVersion('');setCursors([]);setOpening(false);setOpenError('');setNotice('');if(path){setExpanded(before=>new Set([...before,...parentReviewPaths(path)]));setFocusPath(path);}},[task.id,path]);
 useEffect(()=>{setCursors([]);},[version,data?.revision]);
 useEffect(()=>{
  let active=true;setHistoryError('');setHistoryView(null);setHistoryLoading(false);
  if(!version||!selected)return()=>{active=false;};
  setHistoryLoading(true);
  void window.musebench!.inspectFileReview({taskId:task.id,scope:'run',runId:version}).then(result=>{
   if(!active||currentHistory.current!==historyKey)return;
   if(result.taskId!==task.id||result.runId!==version)throw Error('The captured version belongs to a different prompt.');
   setHistoryView({key:historyKey,value:result});
  }).catch(error=>{if(active&&currentHistory.current===historyKey)setHistoryError(errorText(error));}).finally(()=>{if(active&&currentHistory.current===historyKey)setHistoryLoading(false);});
  return()=>{active=false;};
 },[historyKey,selected?.path,data?.revision]);

 useEffect(()=>{
  let active=true;setPage(null);setPageError('');setPageLoading(false);
  if(!comparison||comparison.status!=='complete'||!comparisonFile||!comparisonFile.available||comparisonFile.binary)return()=>{active=false;};
  setPageLoading(true);
  void window.musebench!.readFileReview({taskId:task.id,scope:version?'run':scope,...((version||scope==='run')?{runId:version||runId}:{}),path,revision:comparison.revision,...(cursor?{cursor}:{}),limit:200}).then(result=>{
   if(!active||currentComparison.current!==comparisonKey)return;
   if(result.revision!==comparison.revision||result.path!==path)throw Error('The comparison changed while loading. Refresh the file review.');
   setPage({key:comparisonKey,value:result});
   if(!version&&result.status==='complete')setKnownCounts(before=>({key:countsKey,files:{...(before.key===countsKey?before.files:{}),[path]:{additions:result.additions,deletions:result.deletions}}}));
  }).catch(error=>{if(active&&currentComparison.current===comparisonKey)setPageError(errorText(error));}).finally(()=>{if(active&&currentComparison.current===comparisonKey)setPageLoading(false);});
  return()=>{active=false;};
 },[comparisonKey,comparison?.status,comparisonFile?.available,comparisonFile?.binary]);

 const countedFiles=useMemo(()=>files.map(file=>knownCounts.key===countsKey&&Object.hasOwn(knownCounts.files,file.path)?{...file,countsKnown:true,...knownCounts.files[file.path]}:file),[files,knownCounts,countsKey]);
 const visibleFiles=useMemo(()=>countedFiles.filter(file=>(scope==='run'||showAll||file.status!=='unchanged')&&(!query||file.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()))),[countedFiles,scope,showAll,query]);
 const nodes=useMemo(()=>buildReviewTree(visibleFiles),[visibleFiles]);
 const treePagesKey=inspectionKey+':'+showAll+':'+query+':'+path;
 const siblingOffset=(items:ReviewTreeNode[],parent:string)=>{
  const selectedIndex=items.findIndex(node=>node.path===path||!node.file&&path.startsWith(node.path+'/'));
  const requested=treePages.key===treePagesKey&&Object.hasOwn(treePages.offsets,parent)?treePages.offsets[parent]:Math.floor(Math.max(0,selectedIndex)/TREE_PAGE_SIZE)*TREE_PAGE_SIZE;
  return Math.min(Math.max(0,requested),Math.max(0,Math.ceil(items.length/TREE_PAGE_SIZE)-1)*TREE_PAGE_SIZE);
 };
 const pageSiblings=(parent:string,offset:number)=>setTreePages(before=>({key:treePagesKey,offsets:{...(before.key===treePagesKey?before.offsets:{}),[parent]:offset}}));
 const visibleTreePaths:string[]=[];const collectVisible=(items:ReviewTreeNode[],parent='')=>{const offset=siblingOffset(items,parent);for(const node of items.slice(offset,offset+TREE_PAGE_SIZE)){visibleTreePaths.push(node.path);if(!node.file&&(query||expanded.has(node.path)))collectVisible(node.children,node.path);}};collectVisible(nodes);
 const tabbablePath=visibleTreePaths.includes(focusPath)?focusPath:visibleTreePaths[0];
 const {changedCount,totals}=useMemo(()=>countedFiles.reduce((summary,file)=>({changedCount:summary.changedCount+(file.status!=='unchanged'?1:0),totals:{additions:summary.totals.additions+(file.additions??0),deletions:summary.totals.deletions+(file.deletions??0),unknown:summary.totals.unknown||file.status!=='unchanged'&&!file.countsKnown}}),{changedCount:0,totals:{additions:0,deletions:0,unknown:false}}),[countedFiles]);
 const chooseFile=(file:FileReviewFile)=>{setPath(file.path);setFocusPath(file.path);onSelectFilePath?.(file.path);};
 const toggle=(node:ReviewTreeNode)=>{setFocusPath(node.path);setExpanded(before=>{const next=new Set(before);if(next.has(node.path))next.delete(node.path);else next.add(node.path);return next;});};
 const treeKeys=(event:KeyboardEvent<HTMLUListElement>)=>{
  const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[role="treeitem"]');if(!target)return;
  const items=[...tree.current!.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')],index=items.indexOf(target);let next:HTMLButtonElement|undefined;
  if(event.key==='ArrowDown')next=items[Math.min(index+1,items.length-1)];else if(event.key==='ArrowUp')next=items[Math.max(index-1,0)];else if(event.key==='Home')next=items[0];else if(event.key==='End')next=items.at(-1);
  else if(event.key==='ArrowRight'&&target.hasAttribute('aria-expanded')){if(target.getAttribute('aria-expanded')==='false')target.click();else next=items[index+1];}
  else if(event.key==='ArrowLeft'){if(target.getAttribute('aria-expanded')==='true')target.click();else next=items.find(item=>item.dataset.path===target.dataset.parent);}
  else return;event.preventDefault();if(next){setFocusPath(next.dataset.path??'');next.focus();}
 };
 const renderNodes=(items:ReviewTreeNode[],parent='',level=1)=>{const offset=siblingOffset(items,parent);return <>{items.slice(offset,offset+TREE_PAGE_SIZE).map((node,index)=>{const folder=!node.file,open=!!query||expanded.has(node.path),focused=tabbablePath===node.path;return <li role="none" key={node.path}><button type="button" role="treeitem" data-path={node.path} data-parent={parent} aria-level={level} aria-setsize={items.length} aria-posinset={offset+index+1} aria-expanded={folder?open:undefined} aria-selected={folder?undefined:path===node.path} tabIndex={focused?0:-1} className={`file-review-tree-row ${!folder&&path===node.path?'selected':''}`} style={{paddingInlineStart:8+(level-1)*14}} onFocus={()=>setFocusPath(node.path)} onClick={()=>folder?toggle(node):chooseFile(node.file!)} title={node.path}>{folder?<>{open?<ChevronDown size={12}/>:<ChevronRight size={12}/>} {open?<FolderOpen size={14}/>:<Folder size={14}/>}</>:<><span className="file-review-tree-spacer"/><File size={14}/></>}<span className="file-review-tree-name">{node.name}</span>{!folder&&node.file?.status!=='unchanged'&&<span className={`file-review-file-status ${node.file!.status}`} title={node.file!.status}>{node.file!.status==='added'?'A':node.file!.status==='deleted'?'D':'M'}</span>}{node.changed>0&&<Counts additions={node.additions} deletions={node.deletions} unknown={node.unknownCounts}/>}</button>{folder&&open&&<ul role="group">{renderNodes(node.children,node.path,level+1)}</ul>}</li>;})}{items.length>TREE_PAGE_SIZE&&<li role="none" className="file-review-tree-pagination"><nav aria-label={`Files in ${parent||'project root'}`}><span>{offset+1}–{Math.min(offset+TREE_PAGE_SIZE,items.length)} of {items.length.toLocaleString()}</span><div><button type="button" disabled={!offset} onClick={()=>pageSiblings(parent,Math.max(0,offset-TREE_PAGE_SIZE))}>Previous files</button><button type="button" disabled={offset+TREE_PAGE_SIZE>=items.length} onClick={()=>pageSiblings(parent,offset+TREE_PAGE_SIZE)}>Next files</button></div></nav></li>}</>;};
 const openFile=async()=>{const key=currentInspection.current,selection=fileSelectionKey,valid=()=>currentInspection.current===key&&currentFileSelection.current===selection;setOpening(true);setOpenError('');setNotice('');try{const result=await window.musebench!.openProjectFile({taskId:task.id,path,editor:'vscode',source:'review'});if(valid())setNotice(result.opened?'Opened in VS Code.':'Choose an editor to open this file.');}catch(error){if(valid())setOpenError(errorText(error));}finally{if(valid())setOpening(false);}};
 const emptyText=scope==='run'?'No source changes were captured for this prompt.':'No changed files in this workspace.';
 const runChoices=[...(task.runs??[])].reverse(),versionChoices=selected?.history.filter((entry,index,entries)=>entries.findIndex(item=>item.runId===entry.runId)===index)??[];
 return <section className="file-changes-browser" aria-label="File changes browser">
  <header className="file-review-toolbar"><div className="file-review-scope" role="group" aria-label="Change scope"><button type="button" aria-pressed={scope==='run'} onClick={()=>{setScope('run');setVersion('');setCursors([]);}}>This prompt</button><button type="button" aria-pressed={scope==='all'} onClick={()=>{setScope('all');setVersion('');setCursors([]);}}>All changes</button></div><button type="button" className="icon-button" aria-label="Refresh file changes" disabled={loading} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={14}/></button></header>
  {scope==='run'&&runChoices.length>0&&<label className="file-review-prompt-label">Prompt<select aria-label="Prompt changes" value={runId} onChange={event=>{setRunId(event.target.value);setVersion('');setCursors([]);}}>{!runChoices.some(run=>run.promptId===runId)&&runId&&<option value={runId}>{runLabel(undefined,runId)}</option>}{runChoices.map(run=><option key={run.id} value={run.promptId}>{runLabel(run,run.promptId)}</option>)}</select></label>}
  {scope==='run'&&runId&&onReviewPrompt&&<button type="button" className="button file-review-notes" onClick={()=>onReviewPrompt(runId)}>Review and comment</button>}
  <p className="file-review-caption">{scope==='run'?'Captured before and after this prompt. Other tools may have changed these files too.':'Current workspace compared with this chat’s starting files.'}</p>
  {error&&<p role="alert" className="file-review-error">{error} <button type="button" onClick={()=>setRefresh(value=>value+1)}>Try again</button></p>}
  {loading&&<p role="status" className="file-review-empty"><LoaderCircle className="spin" size={15}/>Loading file changes…</p>}
  {!loading&&!error&&(!runId&&scope==='run'||data&&data.status!=='complete')&&<p className="file-review-empty" role="status">{data?.reason??'No captured prompt is available. Choose All changes to inspect this workspace.'}</p>}
  {data?.status==='complete'&&<><div className="file-review-summary"><span>{changedCount} changed {changedCount===1?'file':'files'}{scope==='all'&&` · ${files.length} files`}</span><Counts additions={totals.additions} deletions={totals.deletions} unknown={totals.unknown}/></div><div className="file-review-layout"><aside className="file-review-sidebar" aria-label="Review files">
   {scope==='all'&&<div className="file-review-filter" role="group" aria-label="Files shown"><button type="button" aria-pressed={!showAll} onClick={()=>setShowAll(false)}>Changed files</button><button type="button" aria-pressed={showAll} onClick={()=>setShowAll(true)}>All files</button></div>}
   <label className="file-review-search"><Search size={13}/><input aria-label="Filter review files" placeholder="Filter files…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
   {nodes.length?<ul ref={tree} role="tree" aria-label="File changes" className="file-review-tree" onKeyDown={treeKeys}>{renderNodes(nodes)}</ul>:<p className="file-review-empty">{query?'No files match this filter.':emptyText}</p>}
  </aside><div className="file-review-detail">{selected?<><div className="file-review-file-heading"><div><strong title={path}>{path}</strong><span>{comparisonFile?.status==='unchanged'?'Current file':comparisonFile?.status??selected.status}{comparisonFile?.binary?' · Binary file':''}</span></div><button type="button" className="button file-review-open" disabled={opening} title="Open the current workspace file in VS Code" onClick={()=>void openFile()}><Code2 size={14}/><span>{opening?'Opening…':'Open in VS Code'}</span></button></div>
   <label className="file-review-version">Version<select aria-label="File version" value={version} onChange={event=>{setVersion(event.target.value);setCursors([]);}}><option value="">{scope==='run'?'This prompt capture':'Current workspace'}</option>{versionChoices.filter(entry=>scope!=='run'||entry.runId!==runId).map(entry=><option value={entry.runId} key={entry.runId}>{new Date(entry.capturedAt).toLocaleString()} · {runLabel(task.runs?.find(run=>run.promptId===entry.runId),entry.runId)}</option>)}</select></label>
   {version&&<p className="file-review-caption">Captured prompt version from this chat.</p>}{(openError||notice)&&<p className={openError?'file-review-error':'file-review-caption'} role={openError?'alert':'status'}>{openError||notice}</p>}
   {historyLoading&&<p className="file-review-empty" role="status">Loading captured version…</p>}{historyError&&<p className="file-review-error" role="alert">{historyError}<button type="button" onClick={()=>setRefresh(value=>value+1)}>Retry captured version</button></p>}
   {!historyLoading&&!historyError&&comparison&&comparison.status!=='complete'&&<p className="file-review-empty">{comparison.reason??'This capture is unavailable.'}</p>}
   {!historyLoading&&!historyError&&comparison?.status==='complete'&&(!comparisonFile||!comparisonFile.available||comparisonFile.binary)&&<p className="file-review-empty">{comparisonFile?.reason??(comparisonFile?.binary?'Binary contents cannot be shown as a text diff.':'This file was not captured for this prompt.')}</p>}
   {comparison?.status==='complete'&&comparisonFile?.available&&!comparisonFile.binary&&<><FileDiffView rows={currentPage?.rows??[]} path={path} loading={pageLoading} error={pageError||(!pageLoading&&currentPage?.status==='unavailable'?currentPage.reason:undefined)} additions={currentPage?.additions} deletions={currentPage?.deletions}/>{(pageError||currentPage?.status==='unavailable')&&<button type="button" className="button file-review-retry" onClick={()=>setRetry(value=>value+1)}>Retry comparison</button>}{currentPage?.status==='complete'&&<nav className="file-review-pages" aria-label="Comparison pages"><button type="button" className="button" disabled={!cursors.length||pageLoading} onClick={()=>setCursors(before=>before.slice(0,-1))}>Previous page</button><span>Page {cursors.length+1} · {currentPage.totalRows.toLocaleString()} diff rows</span><button type="button" className="button" disabled={!currentPage.nextCursor||pageLoading} onClick={()=>{if(currentPage.nextCursor)setCursors(before=>[...before,currentPage.nextCursor!]);}}>Next page</button></nav>}</>}
  </>:<p className="file-review-empty">{files.length?'Select a file to review its changes.':emptyText}</p>}</div></div></>}
 </section>;
}
