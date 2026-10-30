import {createHash} from 'node:crypto';
const digest=text=>createHash('sha256').update(text).digest('hex');
export function contextReceipt(prepared,{project,memories='',attachments=[],revision=null}={}){
 return{version:1,promptHash:digest(prepared.prompt),revision,historyMode:prepared.historyMode,nativeContext:'unknown',...(prepared.recentContext?{recentContext:prepared.recentContext}:{}),messages:prepared.includedSources??[],sources:[...attachments].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(({path,hash,text})=>({path,hash,characters:text.length})),instructions:{personal:memories?digest(memories):null,project:project?.instructions?digest(project.instructions):null},characters:prepared.characters};
}
