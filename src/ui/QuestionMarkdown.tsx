import {memo,useState} from 'react';
import Markdown,{type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {allowedExternal} from '../shared/external-links.mjs';

const plugins=[remarkGfm];
const inlineElements=['p','em','strong','del','code','a','br','img'];

export const QuestionMarkdown=memo(function QuestionMarkdown({text,inline=false}:{text:string;inline?:boolean}){
 const [error,setError]=useState('');
 const components:Components={
  a:({href,children})=>allowedExternal(href)?<a href={href} title={href} onClick={event=>{
   event.preventDefault();event.stopPropagation();setError('');
   if(window.musebench?.openExternal)void window.musebench.openExternal(href!).catch(()=>setError('This link could not be opened.'));
   else window.open(href,'_blank','noopener,noreferrer');
  }}>{children}</a>:<span title={href}>{children}{href&&<span className="question-link-address"> ({href})</span>}</span>,
  img:({alt})=><span className="question-image-reference">{alt||'Image reference'}</span>,
  ...(inline?{p:({children})=><span>{children}</span>}:{}),
 };
 const content=<><Markdown remarkPlugins={plugins} skipHtml components={components} allowedElements={inline?inlineElements:undefined} unwrapDisallowed={inline}>{text}</Markdown>{error&&<span className="question-link-error" role="alert">{error}</span>}</>;
 return inline?<span className="question-markdown question-markdown-inline">{content}</span>:<div className="question-markdown">{content}</div>;
});
