// Literal case-insensitive occurrences, with offsets/lengths in the original UTF-16 text.
// Lowercasing can expand a character (e.g. İ), so folded offsets cannot be returned directly.
export function* literalOccurrences(text,query){
 const folded=text.toLowerCase(),needle=query.toLowerCase();if(!needle)return;
 let from=0,original=0,normalized=0;
 for(let index;(index=folded.indexOf(needle,from))>=0;){
  const end=index+needle.length;let start=index,finish=end;
  if(folded.length!==text.length){
   while(original<text.length){const character=String.fromCodePoint(text.codePointAt(original)),size=character.toLowerCase().length;if(normalized+size>index)break;normalized+=size;original+=character.length;}
   start=original;let pos=original,norm=normalized;
   while(norm<end&&pos<text.length){const character=String.fromCodePoint(text.codePointAt(pos));norm+=character.toLowerCase().length;pos+=character.length;}finish=pos;
  }
  yield{offset:start,length:finish-start};from=end;
 }
}
export function validateHistoryFind(input){
 if(!input||typeof input.taskId!=='string'||!input.taskId||typeof input.query!=='string'||!input.query.length||input.query.length>500||!['next','previous'].includes(input.direction)||input.cursor!==undefined&&(!input.cursor||typeof input.cursor.messageId!=='string'||!input.cursor.messageId||!Number.isSafeInteger(input.cursor.offset)||input.cursor.offset<0||input.cursor.offset>1024*1024))throw Error('Invalid history find request.');
}
export function historyHit(row,match){
 const excerptOffset=Math.max(0,match.offset-300);
 return{messageId:row.message_id??row.id,role:row.role,...match,excerptOffset,excerpt:row.text.slice(excerptOffset,excerptOffset+1200),captureTruncated:Boolean(row.captureTruncated)};
}
// Preview uses its existing in-memory sample capture; desktop streams candidate rows from SQLite.
export function findPreviewHistory(messages,input){
 validateHistoryFind(input);const rows=messages.filter(m=>m.role!=='system'),forward=input.direction==='next',cursor=input.cursor;
 const selected=cursor?rows.findIndex(m=>m.id===cursor.messageId):-1;
 if(cursor){let valid=false;if(selected>=0)for(const m of literalOccurrences(rows[selected].text,input.query)){if(m.offset===cursor.offset){valid=true;break;}if(m.offset>cursor.offset)break;}if(!valid)throw Error('Invalid history cursor.');}
 const ordered=forward?rows:[...rows].reverse();let fallback=null;
 for(const row of ordered){let choice=null;const index=rows.indexOf(row);
  for(const match of literalOccurrences(row.text,input.query)){
   const candidate={row,match};
   if(forward){fallback??=candidate;if(!cursor||index>selected||index===selected&&match.offset>cursor.offset)return{hit:historyHit(row,match),wrapped:false,coverage:'preview-sample'};}
   else{if(!fallback||fallback.row.id===row.id)fallback=candidate;if(!cursor||index<selected||index===selected&&match.offset<cursor.offset)choice=match;}
  }
  if(choice)return{hit:historyHit(row,choice),wrapped:false,coverage:'preview-sample'};
 }
 return{hit:fallback?historyHit(fallback.row,fallback.match):null,wrapped:Boolean(cursor&&fallback),coverage:'preview-sample'};
}
