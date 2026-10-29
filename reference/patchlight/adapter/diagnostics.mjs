/** Bounded display text, with common credential forms removed. Never an instruction or retry policy. */
export function diagnosticText(value) {
 if(typeof value!=='string')return '';
 return value.slice(0,16384)
  .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi,'credential [redacted]')
  .replace(/\b(?:[A-Z0-9]+_)*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)["']?\s*[:=]\s*(?:"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|'(?:\\[\s\S]|[^'\\])*(?:'|\\?$)|[^\s,;}]+)/gi,'credential=[redacted]')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}/g,'[redacted]')
  .replace(/https?:\/\/[^\s<>]+/gi,address=>{
   try{const url=new URL(address);url.username='';url.password='';url.search='';url.hash='';return url.toString();}
   catch{return '[redacted URL]';}
  })
  .replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,1200);
}

export function terminalReason(params) {
 if(!['failed','cancelled'].includes(params.terminal))return null;
 const source=[params.reason,params.error?.message].find(value=>typeof value==='string'&&value.trim());
 return diagnosticText(source)||null;
}
