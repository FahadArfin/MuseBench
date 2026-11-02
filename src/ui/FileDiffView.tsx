import {memo,useEffect,useMemo,useRef,useState} from 'react';
import './file-diff-view.css';

export interface ReviewDiffRow {
 kind:'context'|'added'|'removed'|'hunk';text:string;oldLine:number|null;newLine:number|null;
 noNewline?:boolean;continued?:boolean;
}
const keywords=new Set('as async await break case catch class const continue def default delete do elif else enum except export extends false finally fn for from function if implements import in instanceof interface let match new None null of pass private protected public raise readonly return self static struct super switch this throw true try type typeof undefined var void while with yield'.split(' '));
const pattern=/(\/\/[^\r\n]*|\/\*.*?\*\/|<!--[\s\S]*?-->|(?:^|\s)#[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b[A-Za-z_$][\w$]*\b|[{}()[\]:,;=<>+*/!?&|%-])/g;

// Render source as React text nodes only. This is a lightweight lexical aid,
// not an HTML interpreter or a claim of a full language parser.
const SourceLine=memo(function SourceLine({text,path}:{text:string;path:string}){
 const language=path.split('.').at(-1)?.toLowerCase()??'';
 if(!['js','jsx','ts','tsx','mjs','cjs','json','jsonc','css','scss','html','htm','xml','svg','py','rs','go','java','c','cpp','h','sh','ps1','yml','yaml','toml'].includes(language))return <>{text||' '}</>;
 const nodes=[];let offset=0,count=0;pattern.lastIndex=0;
 for(const match of text.matchAll(pattern)){
  if(count++>700)break;const at=match.index!,value=match[0];
  if(at>offset)nodes.push(text.slice(offset,at));
  let kind='';
  if(value.startsWith('//')||value.startsWith('/*')||value.startsWith('<!--')||value.trimStart().startsWith('#'))kind='comment';
  else if(/^['"`]/.test(value))kind=text.slice(at+value.length).trimStart().startsWith(':')?'property':'string';
  else if(/^\d/.test(value))kind='number';else if(keywords.has(value))kind='keyword';
  else if(text.slice(at+value.length).trimStart().startsWith('('))kind='function';
  else if(/^[{}()[\]:,;=<>+*/!?&|%-]$/.test(value))kind='punctuation';
  nodes.push(kind?<span key={at} className={`source-token-${kind}`}>{value}</span>:value);offset=at+value.length;
 }
 if(offset<text.length)nodes.push(text.slice(offset));return <>{nodes.length?nodes:' '}</>;
});

export function FileDiffView({rows,path,loading=false,error='',onMore,hasMore=false,appendLoading=false,emptyMessage='No text changes in this comparison.'}:{rows:ReviewDiffRow[];path:string;loading?:boolean;error?:string;onMore?:()=>void;hasMore?:boolean;appendLoading?:boolean;additions?:number;deletions?:number;emptyMessage?:string}){
 const scroll=useRef<HTMLDivElement>(null),[top,setTop]=useState(0),[height,setHeight]=useState(500);
 useEffect(()=>{setTop(0);if(scroll.current)scroll.current.scrollTop=0;},[rows,path]);
 useEffect(()=>{const el=scroll.current;if(!el)return;const observer=new ResizeObserver(()=>setHeight(el.clientHeight));observer.observe(el);setHeight(el.clientHeight);return()=>observer.disconnect();},[loading,rows.length]);
 const rowHeight=23,start=Math.max(0,Math.floor(top/rowHeight)-8),end=Math.min(rows.length,start+Math.ceil(height/rowHeight)+18);
 const width=useMemo(()=>Math.min(8192,Math.max(1,...rows.map(row=>row.text.length)))*7.25+124,[rows]);
 return <div className="file-diff-view">
  {error&&<p className="file-diff-error" role="alert">{error}</p>}
  {loading?<p role="status" className="file-diff-state">Loading comparison…</p>:error&&!rows.length?null:!rows.length?<p className="file-diff-state">{emptyMessage}</p>:<div ref={scroll} className="file-diff-scroll" tabIndex={0} aria-label={`File diff for ${path}`} onScroll={event=>setTop(event.currentTarget.scrollTop)}>
   <div className="file-diff-rows" style={{height:rows.length*rowHeight,minWidth:width}} aria-label="Comparison lines">
    {rows.slice(start,end).map((row,index)=><div key={start+index} className={`file-diff-row ${row.kind}`} style={{top:(start+index)*rowHeight,height:rowHeight}}>
     <span className="file-diff-old" aria-label={row.oldLine?`Old line ${row.oldLine}`:undefined}>{row.continued?'↳':row.oldLine??''}</span><span className="file-diff-new" aria-label={row.newLine?`New line ${row.newLine}`:undefined}>{row.continued?'↳':row.newLine??''}</span><span className="file-diff-sign">{row.kind==='added'?'+':row.kind==='removed'?'−':row.kind==='hunk'?'⋯':''}</span><code><SourceLine text={row.text.replace(/\r$/,'')} path={path}/>{row.noNewline&&<small className="file-diff-no-newline"> No newline at end of file</small>}</code>
    </div>)}
   </div>
  </div>}
  {hasMore&&onMore&&<button type="button" className="button file-diff-more" disabled={appendLoading} onClick={onMore}>{appendLoading?'Loading…':'Next page'}</button>}
 </div>;
}
