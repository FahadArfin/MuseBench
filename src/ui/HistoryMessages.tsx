import type {HistoryPage} from '../shared/types';

export type HistoryCursor={before?:string;messageId?:string;offset?:number};
export function HistoryMessages({page,pending,onPage,onReset,onExcerpt,excerptLabel}:{page:HistoryPage;pending:boolean;onPage:(cursor:HistoryCursor)=>void;onReset?:()=>void;onExcerpt?:(message:HistoryPage['messages'][number])=>void;excerptLabel?:string}){
 return <div aria-busy={pending}>
  {onReset&&<button className="text-link" disabled={pending} onClick={onReset}>Back to conversation</button>}
  {page.before&&<button disabled={pending} onClick={()=>onPage({before:page.before!})}>Older messages</button>}
  {page.messages.map(message=><article className="history-source" key={message.id}>
   <header><strong>{message.role}</strong><time>{message.at?new Date(message.at).toLocaleString():'Date unavailable'}</time></header>
   <pre>{message.text}</pre>
   {message.captureTruncated&&<p>Capture limited to 1,048,576 characters.</p>}
   {message.offset>0&&<button disabled={pending} onClick={()=>onPage({messageId:message.id,offset:Math.max(0,message.offset-12000)})}>Previous excerpt</button>}
   {message.offset+message.text.length<message.textLength&&<button disabled={pending} onClick={()=>onPage({messageId:message.id,offset:message.offset+message.text.length})}>Next excerpt</button>}
   {onExcerpt&&<button className="text-link" disabled={pending} onClick={()=>onExcerpt(message)}>{excerptLabel??'Add excerpt to draft'}</button>}
  </article>)}
 </div>;
}
