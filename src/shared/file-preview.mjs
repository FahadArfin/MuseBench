export function previewKind(value=''){
 const extension=String(value).split(/[?#]/)[0].split('.').at(-1)?.toLowerCase();
 return ({html:'html',htm:'html',md:'markdown',markdown:'markdown',pdf:'pdf',docx:'docx',pptx:'pptx',txt:'text',json:'text',csv:'text',tsv:'text',yaml:'text',yml:'text',xml:'text',tex:'text',log:'text',png:'image',jpg:'image',jpeg:'image',webp:'image',gif:'image',svg:'image'})[extension]??null;
}
export function localPreviewPath(value,root=''){
 if(typeof value!=='string'||value.length>4096)return null;
 let candidate=value.trim();try{if(candidate.startsWith('file:')){const url=new URL(candidate);if(url.host&&!['localhost'].includes(url.host))return null;candidate=url.pathname.replace(/^\/(?=[A-Za-z]:\/)/,'');}candidate=decodeURIComponent(candidate.split(/[?#]/)[0]);}catch{return null;}
 candidate=candidate.replaceAll('\\','/');const base=String(root).replaceAll('\\','/').replace(/\/$/,'');
 if(base&&candidate.toLowerCase().startsWith(base.toLowerCase()+'/'))candidate=candidate.slice(base.length+1);
 if(candidate.startsWith('./'))candidate=candidate.slice(2);
 if(!candidate||candidate.startsWith('/')||candidate.includes(':')||/[\x00-\x1f]/.test(candidate)||candidate.split('/').some(p=>!p||p.startsWith('.'))||!previewKind(candidate))return null;
 return candidate;
}
export function linkedPreviewFiles(text,root=''){
 const paths=[],source=String(text).slice(0,128000).replace(/```[\s\S]*?```|`[^`]*`/g,'');
 for(const match of source.matchAll(/\[[^\]\n]{1,300}\]\(<?([^\n)<>]{1,4096})>?\)/g)){const value=localPreviewPath(match[1],root);if(value&&!paths.includes(value))paths.push(value);if(paths.length>=20)break;}return paths;
}
