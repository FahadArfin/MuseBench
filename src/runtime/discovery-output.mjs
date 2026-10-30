const MAX_FRAME_BYTES=131072,MAX_PREVIEW_CODE_POINTS=16000;
// Match discovery-mcp's nested text result and emitted JSONL delimiter. The
// existing 128-character request-ID reserve remains conservative for normal IDs.
export const discoveryResultWireBytes=value=>Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id:'x'.repeat(128),result:{content:[{type:'text',text:JSON.stringify(value)}]}})+'\n');

export function boundDiscoveryResult(receipt,result){
 const outcome=result.isError?'failed':'completed',complete={...receipt,outcome,result},originalWireBytes=discoveryResultWireBytes(complete);
 if(originalWireBytes<=MAX_FRAME_BYTES)return complete;
 const points=[];let omittedNonTextBlocks=0;
 for(const block of result.content){if(block.type==='text'){for(const point of block.text)points.push(point);}else omittedNonTextBlocks++;}
 const notice='Lossy gateway preview of a validated tool result. Only text content is retained; media, structured output and metadata are omitted. '+
  (points.length?'Text is concatenated in source order; omission counts are Unicode code points. ':'No text content is available to preview. ')+
  'originalWireBytes measures the complete original encoded JSON-RPC frame in bytes. '+
  (result.truncated===true?'The source also marked its result truncated. ':'')+
  'The operation was not retried; inspect its effects before another request.';
 function preview(limit){
  let retained=Math.min(points.length,limit),text='';
  if(retained===points.length)text=points.join('');
  else{
   let marker;
   do{marker=`\n[... ${points.length-retained} text code points omitted ...]\n`;const next=Math.max(0,limit-Array.from(marker).length);if(next>=retained)break;retained=next;}while(true);
   const head=Math.ceil(retained/2),tail=Math.floor(retained/2);
   text=points.slice(0,head).join('')+marker+(tail?points.slice(-tail).join(''):'');
  }
  return{...receipt,outcome,truncated:true,preview:{text,originalWireBytes,omittedTextCodePoints:points.length-retained,omittedNonTextBlocks},notice};
 }
 let value=preview(MAX_PREVIEW_CODE_POINTS);
 // Escaping happens twice in this protocol. Bound the full encoded frame after
 // taking the text preview, rather than assuming a per-character byte budget.
 if(discoveryResultWireBytes(value)>MAX_FRAME_BYTES){
  let low=0,high=MAX_PREVIEW_CODE_POINTS;
  while(low<high){const middle=Math.ceil((low+high)/2),candidate=preview(middle);if(discoveryResultWireBytes(candidate)<=MAX_FRAME_BYTES)low=middle;else high=middle-1;}
  value=preview(low);
 }
 return value;
}
