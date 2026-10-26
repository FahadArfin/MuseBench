// Wrapper captured from the 1.4.13 native read_skill tool, not model prose.
export function skillReceipt(payload){
 if(payload?.kind!=='tool_result'||payload.correlation_facts?.tool_name!=='read_skill'||payload.correlation_facts.outcome!=='success'||typeof payload.call_id!=='string'||typeof payload.text!=='string')return null;
 const head=payload.text.slice(0,3000),name=/^<read-skill-result name="([\w:./-]{1,200})" status="ok">\r?\n<metadata>\r?\n/.exec(head),scope=/^source: (bundled|user|project|plugin)$/m.exec(head),bytes=/^bytes_returned: (\d+)$/m.exec(head),total=/^bytes_total: (\d+)$/m.exec(head),truncated=/^truncated: (true|false)$/m.exec(head);
 if(!name||!scope||!bytes||!total||!truncated||!head.includes('</metadata>'))return null;
 const value={id:name[1],scope:scope[1],bytes:Number(bytes[1]),total:Number(total[1]),truncated:truncated[1]==='true',callId:payload.call_id,runId:payload.run_stream?.id};
 return restoreSkillReceipts([value])[0]??null;
}
export function restoreSkillReceipts(value){return(Array.isArray(value)?value:[]).filter(v=>v&&typeof v.id==='string'&&/^[\w:./-]{1,200}$/.test(v.id)&&['bundled','user','project','plugin'].includes(v.scope)&&Number.isSafeInteger(v.bytes)&&v.bytes>=0&&Number.isSafeInteger(v.total)&&v.total>=v.bytes&&typeof v.truncated==='boolean'&&typeof v.callId==='string'&&v.callId.length<=200&&typeof v.runId==='string'&&v.runId.length<=200).slice(-32).map(({id,scope,bytes,total,truncated,callId,runId})=>({id,scope,bytes,total,truncated,callId,runId}));}
