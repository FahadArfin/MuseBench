/** Ordinary draft text only. Every captured line remains inside the quote. */
export function buildResponseQuote({taskId,messageId,displayedText,selection=null,draftText=''}){
 for(const id of [taskId,messageId])if(typeof id!=='string'||!id||id.length>200||!/^[\w:-]+$/.test(id))throw Error('The quote source is unavailable.');
 const text=selection===null?displayedText:selection;
 if(typeof text!=='string'||!text.trim())throw Error('Select some response text to quote.');
 if(typeof draftText!=='string'||text.length>16000)throw Error('This quote and draft exceed 16,000 characters. Select a smaller passage.');
 const escaped=text.replace(/[\\`*_{}\[\]<>]/g,'\\$&');
 const quote=`Quoted assistant reply (chat ${taskId}; message ${messageId}):\n${escaped.split('\n').map(line=>'> '+line).join('\n')}`;
 if(draftText.length+(draftText?2:0)+quote.length>16000)throw Error('This quote and draft exceed 16,000 characters. Select a smaller passage.');
 return quote;
}
