import {randomUUID,createHash} from 'node:crypto';
import {createConversationImportReader} from './conversation-import-reader.mjs';
import {IMPORT_LIMITS,conversationFingerprintInput} from '../shared/conversation-import.mjs';

const lifetime=10*60*1000;
export function createConversationImports(db,history,{now=Date.now,reader=createConversationImportReader()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS imported_chats(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,title TEXT NOT NULL,provenance TEXT NOT NULL,created_at TEXT NOT NULL);');
 const byFingerprint=db.prepare('SELECT id FROM imported_chats WHERE fingerprint=?'),byId=db.prepare('SELECT * FROM imported_chats WHERE id=?');
 const add=db.prepare('INSERT INTO imported_chats VALUES(?,?,?,?,?)');
 let pending=null,timer=null,closed=false,busy=false;
 const available=()=>{if(closed)throw Error('Conversation imports closed.');};
 const discard=token=>{if(pending?.token===token){pending=null;clearTimeout(timer);}};
 function selected(token){available();if(!pending||typeof token!=='string'||pending.token!==token)throw Error('This import preview is no longer available. Choose the export again.');if(now()>=pending.expires){discard(token);throw Error('This import preview expired. Choose the export again.');}return pending;}
 function metadata(row){return JSON.parse(row.provenance);}
 function summary(item){const {conversation:c,id,fingerprint}=item;return{id,title:c.title,format:c.format,messageCount:c.messages.length,textBytes:c.textBytes,omittedMessages:c.omittedMessages,omittedBlocks:c.omittedBlocks,snippet:c.messages[0].text.slice(0,180),duplicate:!!byFingerprint.get(fingerprint)||item.repeated};}
 const publicPreview=p=>({token:p.token,sourceName:p.fileName,sourceDigest:p.digest,expiresAt:new Date(p.expires).toISOString(),conversations:p.items.map(summary),skippedConversations:p.parsed.skippedConversations,textBytes:p.parsed.textBytes});
 async function prepare(source){
  available();if(busy)throw Error('An import is already being prepared.');busy=true;discard(pending?.token);
  try{
   const value=await reader.read(source);available();const seen=new Set();
   const items=value.parsed.conversations.map((conversation,index)=>{const fingerprint=createHash('sha256').update(conversationFingerprintInput(conversation)).digest('hex'),repeated=seen.has(fingerprint);seen.add(fingerprint);return{id:String(index),conversation,fingerprint,repeated};});
   pending={...value,source,items,token:randomUUID(),expires:now()+lifetime};const token=pending.token;timer=setTimeout(()=>discard(token),lifetime);timer.unref?.();return publicPreview(pending);
  }finally{busy=false;}
 }
 function previewPage({token,id,messageId,offset=0,before,limit=20}={}){
  const item=selected(token).items.find(item=>item.id===id);if(!item)throw Error('Choose a conversation from this preview.');
  if(!Number.isInteger(offset)||offset<0||offset>IMPORT_LIMITS.messageCharacters||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid preview page.');
  const messages=item.conversation.messages.map((m,i)=>({...m,id:`m${i}`}));let end=messages.length;
  if(before!==undefined){end=messages.findIndex(m=>m.id===before);if(end<0)throw Error('Invalid preview cursor.');}
  const page=messageId!==undefined?messages.filter(m=>m.id===messageId):messages.slice(Math.max(0,end-limit),end);
  if(messageId!==undefined&&!page.length)throw Error('Preview message not found.');
  return{messages:page.map(m=>({...m,text:m.text.slice(offset,offset+12000),textLength:m.text.length,offset})),total:messages.length,before:messageId===undefined&&end>page.length?page[0].id:null,coverage:'import-preview'};
 }
 function searchPreview({token,query=''}={}){
  const p=selected(token);if(typeof query!=='string'||query.length>200)throw Error('Invalid preview search.');const needle=query.trim().toLowerCase();
  return p.items.flatMap(item=>{const message=needle?item.conversation.messages.find(m=>m.text.toLowerCase().includes(needle)):null;if(needle&&!item.conversation.title.toLowerCase().includes(needle)&&!message)return[];const row=summary(item);if(message){const offset=Math.max(0,message.text.toLowerCase().indexOf(needle)-50);row.snippet=message.text.slice(offset,offset+180);}return[row];});
 }
 async function confirm({token,ids}={}){
  const p=selected(token);if(busy)throw Error('An import is already being prepared.');
  if(!Array.isArray(ids)||!ids.length||ids.length>IMPORT_LIMITS.selectedConversations||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!p.items.some(item=>item.id===id)))throw Error('Choose a valid selection of at most 100 conversations.');
  const items=ids.map(id=>p.items.find(item=>item.id===id));if(items.reduce((total,item)=>total+item.conversation.textBytes,0)>IMPORT_LIMITS.selectedBytes)throw Error('Selection exceeds 2 MiB of text. Select fewer conversations.');
  busy=true;
  try{
   await reader.read(p.source,{expectedDigest:p.digest});if(selected(token)!==p)throw Error('Import preview changed.');
   const result={imported:0,skipped:0,ids:[]};db.exec('SAVEPOINT conversation_import');
   try{
    for(const item of items){
     const existing=byFingerprint.get(item.fingerprint);if(existing){result.skipped++;continue;}
     const c=item.conversation,id=`import:${randomUUID()}`,at=new Date(now()).toISOString();
     const provenance={format:c.format,sourceName:p.fileName,sourceDigest:p.digest,importedAt:at,messageCount:c.messages.length,omittedMessages:c.omittedMessages,omittedBlocks:c.omittedBlocks};
     add.run(id,item.fingerprint,c.title,JSON.stringify(provenance),at);
     c.messages.forEach((message,index)=>history.put(id,{...message,id:`m${index}`}));
     result.imported++;result.ids.push(id);
    }
    db.exec('RELEASE conversation_import');return{...result,preview:publicPreview(p)};
   }catch(error){db.exec('ROLLBACK TO conversation_import; RELEASE conversation_import');throw error;}
  }finally{busy=false;}
 }
 function search(query){
  available();if(typeof query!=='string'||query.length>200)throw Error('Invalid import search.');const needle=query.trim().toLowerCase();
  const rows=needle?db.prepare("SELECT * FROM imported_chats i WHERE instr(history_lower(i.title),?)>0 OR EXISTS(SELECT 1 FROM chat_history h WHERE h.task_id=i.id AND instr(history_lower(h.text),?)>0) ORDER BY created_at DESC,id LIMIT 100").all(needle,needle):db.prepare('SELECT * FROM imported_chats ORDER BY created_at DESC,id LIMIT 100').all();
  return rows.map(row=>{const provenance=metadata(row),hit=needle?history.search(row.id,needle):null;return{id:row.id,projectId:'',projectName:`Imported · ${provenance.format}`,title:row.title,createdAt:row.created_at,updatedAt:row.created_at,mode:'manual',acceptedRevision:null,messageCount:provenance.messageCount,pinned:false,archived:false,imported:provenance,snippet:hit?.snippet??row.title,...(hit?{messageId:hit.messageId,offset:hit.offset,at:hit.at}:{})};});
 }
 function remove(id){
  available();if(typeof id!=='string'||!id.startsWith('import:')||!byId.get(id))throw Error('Imported conversation not found.');
  db.exec('SAVEPOINT remove_import');try{history.deleteTask(id);db.prepare('DELETE FROM imported_chats WHERE id=?').run(id);db.exec('RELEASE remove_import');}catch(error){db.exec('ROLLBACK TO remove_import; RELEASE remove_import');throw error;}
 }
 return{prepare,previewPage,searchPreview,confirm,discard,search,remove,isBusy:()=>busy,has:id=>typeof id==='string'&&id.length<100&&!!byId.get(id),provenance:id=>{const row=byId.get(id);return row?{title:row.title,...metadata(row)}:null;},async close(){if(closed)return;closed=true;discard(pending?.token);await reader.close();}};
}

