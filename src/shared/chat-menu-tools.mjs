import {resolveRequestOrigin} from './chat-relations.mjs';
import {imageAnnotationNotes} from './image-annotations.mjs';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(id);
export function chatLink(id){if(!validId(id))throw Error('Invalid chat link.');return`musebench://chat/${id}`;}
export function chatLinkTask(value){try{const url=new URL(value);const id=url.pathname.slice(1);return url.protocol==='musebench:'&&url.hostname==='chat'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&validId(id)&&value===chatLink(id)?id:null;}catch{return null;}}
export function chatMarkdown(task,messages){
 const rows=messages.filter(m=>['user','assistant'].includes(m.role));
 const initial=resolveRequestOrigin(task)==='initial'&&task.request&&rows[0]?.text!==task.request?`## You\n\n${task.request}\n\n`:'';
 return`# ${task.title.replace(/[\r\n]/g,' ')}\n\n${initial}${rows.map(m=>`## ${m.role==='user'?'You':'Muse'}\n\n${m.text}${m.images?.length?'\n\nAttached images: '+m.images.map(i=>i.name).join(', '):''}${imageAnnotationNotes(m.images)?'\n\n'+imageAnnotationNotes(m.images):''}${m.captureTruncated?'\n\n[The saved capture was truncated.]':''}`).join('\n\n')}\n`;
}
