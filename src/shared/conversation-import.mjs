export const IMPORT_LIMITS=Object.freeze({sourceBytes:128*1024*1024,decodedBytes:32*1024*1024,conversations:2000,messages:50000,messageCharacters:1024*1024,textBytes:16*1024*1024,selectedConversations:100,selectedBytes:2*1024*1024,selectedMessages:2000,selectedIndexTerms:20000});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bytes=text=>new TextEncoder().encode(text).length;
const title=value=>String(value??'Untitled conversation').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,200)||'Untitled conversation';
function date(value){if(typeof value!=='string'&&typeof value!=='number')return null;const time=typeof value==='number'?value*1000:Date.parse(value);return Number.isFinite(time)&&Math.abs(time)<=8640000000000000?new Date(time).toISOString():null;}
function textParts(parts){let omitted=0;const texts=[];for(const part of parts){if(typeof part==='string')texts.push(part);else if(object(part)&&part.type==='text'&&typeof part.text==='string')texts.push(part.text);else omitted++;}return{text:texts.join('\n'),omitted};}
function selectedBranch(mapping,current){
 if(!object(mapping))throw Error('Unsupported ChatGPT conversation mapping.');
 const keys=Object.keys(mapping);if(keys.length>IMPORT_LIMITS.messages)throw Error('Conversation message limit exceeded.');
 if(!keys.length)return [];
 if(typeof current!=='string'||!Object.hasOwn(mapping,current)){
  if(current!=null)throw Error('The exported conversation branch is missing.');
  const parents=new Set(Object.values(mapping).filter(object).map(n=>n.parent));const leaves=keys.filter(key=>!parents.has(key));
  if(leaves.length!==1)throw Error('The export does not identify a single selected conversation branch.');current=leaves[0];
 }
 const seen=new Set(),nodes=[];
 while(current!=null){
  if(typeof current!=='string'||!Object.hasOwn(mapping,current))throw Error('The conversation branch has a missing parent.');
  if(seen.has(current))throw Error('The conversation branch contains a cycle.');seen.add(current);
  const node=mapping[current];if(!object(node))throw Error('The conversation branch contains an invalid node.');nodes.push(node);current=node.parent;
 }
 return nodes.reverse();
}

/** Untrusted export data becomes text records only. No source configuration survives. */
export function parseConversationExport(text,fileName='conversations.json',{allowEmpty=false}={}){
 if(typeof text!=='string'||bytes(text)>IMPORT_LIMITS.decodedBytes)throw Error('Export exceeds the 32 MiB decoded-text limit.');
 let rows,portable=false,plain=false;
 if(/\.(md|txt)$/i.test(fileName)){plain=true;rows=[{title:text.match(/^#\s+(.+)$/m)?.[1]??fileName.replace(/\.[^.]+$/,''),messages:[{role:'user',text}]}];}
 else{
  let value;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('Choose a valid JSON conversation export.');}
  if(object(value)&&value.format==='musebench-conversations'){
   if(value.version!==1)throw Error('Unsupported MuseBench conversation export version.');portable=true;rows=value.conversations;
  }else rows=Array.isArray(value)?value:object(value)&&(object(value.mapping)||Array.isArray(value.chat_messages))?[value]:null;
 }
 if(!Array.isArray(rows)||!rows.length&&!allowEmpty)throw Error('This file has no supported conversations.');
 if(rows.length>IMPORT_LIMITS.conversations)throw Error('Export exceeds the 2,000-conversation limit. Choose a smaller export.');
 const conversations=[];let skippedConversations=0,totalMessages=0,totalBytes=0;
 for(const row of rows){
  if(!object(row))throw Error('Unsupported conversation format.');
  let format,raw,sourceId=null,total=0,omittedBlocks=0;
  if(plain||portable){format=plain?'Text':'MuseBench';if(!Array.isArray(row.messages))throw Error('Unsupported portable conversation messages.');raw=row.messages.map(m=>object(m)?{role:m.role,text:m.text,at:date(m.at)}:null);total=raw.length;}
  else if(object(row.mapping)){
   format='ChatGPT';sourceId=typeof row.id==='string'?row.id.slice(0,200):null;
   total=Object.values(row.mapping).filter(n=>object(n)&&n.message!=null).length;
   raw=selectedBranch(row.mapping,row.current_node).map(n=>{
    const m=n.message;if(!object(m))return null;
    if(m.recipient!=null&&m.recipient!=='all'||m.channel!=null&&m.channel!=='final'||m.metadata?.is_visually_hidden_from_conversation===true)return null;
    const content=Array.isArray(m.content?.parts)?textParts(m.content.parts):{text:'',omitted:1};omittedBlocks+=content.omitted;
    return{role:m.author?.role,text:content.text,at:date(m.create_time)};
   });
  }else if(Array.isArray(row.chat_messages)){
   format='Claude';sourceId=typeof row.uuid==='string'?row.uuid.slice(0,200):null;total=row.chat_messages.length;
   raw=row.chat_messages.map(m=>{
    if(!object(m))return null;
    const content=Array.isArray(m.content)&&m.content.length?textParts(m.content):{text:typeof m.text==='string'?m.text:'',omitted:0};
    omittedBlocks+=content.omitted+(Array.isArray(m.attachments)?m.attachments.length:0)+(Array.isArray(m.files)?m.files.length:0);
    return{role:m.sender==='human'?'user':m.sender,text:content.text,at:date(m.created_at)};
   });
  }else throw Error('Unsupported conversation format. Choose a ChatGPT, Claude or MuseBench export.');
  totalMessages+=total;if(totalMessages>IMPORT_LIMITS.messages)throw Error('Export exceeds the 50,000-message limit.');
  const messages=[];let textBytes=0,indexTerms=0;
  for(const m of raw){
   if(!m||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||!m.text.trim())continue;
   const size=bytes(m.text);if(m.text.length>IMPORT_LIMITS.messageCharacters||size>IMPORT_LIMITS.messageCharacters)throw Error('A message exceeds the 1 MiB import limit.');
   textBytes+=size;totalBytes+=size;if(totalBytes>IMPORT_LIMITS.textBytes)throw Error('Export exceeds the 16 MiB saved-text limit.');messages.push({role:m.role,text:m.text,at:m.at});
   // Match history_terms' per-message unique-word work, calculated off-thread.
   indexTerms+=new Set(m.text.toLowerCase().match(/[\p{L}\p{N}_]+/gu)??[]).size;
  }
  if(!messages.length){skippedConversations++;continue;}
  conversations.push({title:title(row.title??row.name),format,sourceId,messages,textBytes,indexTerms,omittedMessages:Math.max(0,total-messages.length),omittedBlocks});
 }
 if(!conversations.length&&!allowEmpty)throw Error('The export contains no readable user or assistant text.');
 return{conversations,skippedConversations,textBytes:totalBytes,sourceMessageCount:totalMessages};
}

export function conversationFingerprintInput(conversation){return JSON.stringify({format:conversation.format,sourceId:conversation.sourceId,title:conversation.title,messages:conversation.messages});}
export function importExcerpt(titleValue,message){return `Imported conversation excerpt (${titleValue}; ${message.at??'date unavailable'}):\n${message.text}`;}
