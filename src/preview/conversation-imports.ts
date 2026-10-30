import {parseConversationExport,conversationFingerprintInput,IMPORT_LIMITS} from '../shared/conversation-import.mjs';
import type {ParsedConversation} from '../shared/conversation-import.mjs';
import type {ConversationImportPreview,HistoryPage,ImportedProvenance,ChatSearchResult} from '../shared/types';

/** Visual preview data only. Real file selection and durable storage live in the desktop controller. */
export function createPreviewConversationImports(){
 const stored=new Map<string,{conversation:ParsedConversation;fingerprint:string;provenance:ImportedProvenance}>();
 let active:{preview:ConversationImportPreview;conversations:ParsedConversation[]}|null=null;
 const requirePreview=(token:string)=>{if(!active||token!==active.preview.token||Date.parse(active.preview.expiresAt)<=Date.now())throw Error('This import preview expired. Choose the export again.');return active;};
 const rows=(conversations:ParsedConversation[])=>conversations.map((c,index)=>({id:String(index),title:c.title,format:c.format,messageCount:c.messages.length,textBytes:c.textBytes,omittedMessages:c.omittedMessages,omittedBlocks:c.omittedBlocks,snippet:c.messages[0].text.slice(0,180),duplicate:[...stored.values()].some(row=>row.fingerprint===conversationFingerprintInput(c))}));
 const page=(c:ParsedConversation,input:{before?:string;messageId?:string;offset?:number;limit?:number},coverage:string):HistoryPage=>{
  const messages=c.messages.map((m,i)=>({...m,id:`m${i}`})),offset=input.offset??0,end=input.before?messages.findIndex(m=>m.id===input.before):messages.length;if(end<0)throw Error('Invalid history cursor.');
  const selected=input.messageId?messages.filter(m=>m.id===input.messageId):messages.slice(Math.max(0,end-(input.limit??20)),end);
  return{messages:selected.map(m=>({...m,text:m.text.slice(offset,offset+12000),textLength:m.text.length,offset})),total:messages.length,before:!input.messageId&&end>selected.length?selected[0].id:null,coverage};
 };
 return{
  async previewConversationImport(){
   const {conversations,skippedConversations,textBytes}=parseConversationExport(JSON.stringify([{name:'Sample research notes',chat_messages:[{sender:'human',text:'What should we compare in the project?'},{sender:'assistant',text:'Compare the timeline, accessibility and source evidence. This is fictional preview content.'}]},{name:'Sample design review',chat_messages:[{sender:'human',text:'Keep the composer compact and the blue accents subtle.'},{sender:'assistant',text:'Keep one clear primary action and use a restrained selection color.'}]}]));
   const preview:ConversationImportPreview={token:crypto.randomUUID(),sourceName:'Sample conversation export',sourceDigest:'preview-sample',expiresAt:new Date(Date.now()+600000).toISOString(),conversations:rows(conversations),skippedConversations,textBytes,simulation:true};active={preview,conversations};return structuredClone(preview);
  },
  async searchImportPreview({token,query}:{token:string;query:string}){const p=requirePreview(token),needle=query.trim().toLowerCase();return rows(p.conversations).filter((row,index)=>!needle||row.title.toLowerCase().includes(needle)||p.conversations[index].messages.some(m=>m.text.toLowerCase().includes(needle)));},
  async readImportPreview(input:{token:string;id:string;before?:string;messageId?:string;offset?:number;limit?:number}){const p=requirePreview(input.token),c=p.conversations[Number(input.id)];if(!c)throw Error('Preview conversation not found.');return page(c,input,'preview-sample');},
  async confirmConversationImport({token,ids}:{token:string;ids:string[]}){
   const p=requirePreview(token);if(!ids.length||ids.length>IMPORT_LIMITS.selectedConversations||ids.some(id=>!p.preview.conversations.some(row=>row.id===id)))throw Error('Choose a valid conversation selection.');
   let imported=0,skipped=0;const savedIds:string[]=[];
   for(const id of new Set(ids)){const conversation=p.conversations[Number(id)],fingerprint=conversationFingerprintInput(conversation);if([...stored.values()].some(row=>row.fingerprint===fingerprint)){skipped++;continue;}const savedId=`import:${crypto.randomUUID()}`;stored.set(savedId,{conversation,fingerprint,provenance:{format:conversation.format,sourceName:p.preview.sourceName,sourceDigest:'preview-sample',importedAt:new Date().toISOString(),messageCount:conversation.messages.length,omittedMessages:conversation.omittedMessages,omittedBlocks:conversation.omittedBlocks,simulation:true}});savedIds.push(savedId);imported++;}
   p.preview.conversations=rows(p.conversations);return{imported,skipped,ids:savedIds,preview:structuredClone(p.preview)};
  },
  async discardConversationImport(token:string){if(active?.preview.token===token)active=null;},
  async removeImportedConversation(id:string){if(!stored.delete(id))throw Error('Imported conversation not found.');},
  has:(id:string)=>stored.has(id),
  readHistory(input:{taskId:string;before?:string;messageId?:string;offset?:number;limit?:number}){const row=stored.get(input.taskId);if(!row)throw Error('Imported conversation not found.');return page(row.conversation,input,'imported');},
  search(query:string):ChatSearchResult[]{const needle=query.trim().toLowerCase();return[...stored].flatMap(([id,{conversation:c,provenance}])=>{const index=c.messages.findIndex(m=>m.text.toLowerCase().includes(needle)),message=c.messages[index];if(needle&&!c.title.toLowerCase().includes(needle)&&!message)return[];return[{id,projectId:'',projectName:`Imported · ${c.format}`,title:c.title,mode:'manual',acceptedRevision:null,createdAt:provenance.importedAt,updatedAt:provenance.importedAt,imported:provenance,snippet:message?.text.slice(0,240)??c.title,...(message?{messageId:`m${index}`,at:message.at}:{})}];});},
 };
}
