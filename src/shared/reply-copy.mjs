import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const allowedElements=['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','a','img','input'];
function link(href){try{const url=new URL(href);return ['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}
const components={
 a:({href,children})=>{const safe=link(href);return safe?h('a',{href:safe},children):h('span',null,children);},
 img:({alt})=>h('span',null,alt??''),
 input:({checked})=>h('span',null,checked?'[x] ':'[ ] '),
 // Keep code readable when pasting into rich editors without the app's stylesheet.
 pre:({children})=>h('pre',{style:{whiteSpace:'pre-wrap',fontFamily:'monospace'}},children),
 code:({children})=>h('code',{style:{fontFamily:'monospace'}},children),
};
export function replyClipboard(text){
 if(typeof text!=='string'||text.length>100000)throw Error('Invalid clipboard text.');
 return {text,html:renderToStaticMarkup(h(Markdown,{remarkPlugins:[remarkGfm],skipHtml:true,allowedElements,components},text))};
}
