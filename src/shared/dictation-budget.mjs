// The draft protocol and textarea both count UTF-16 code units.
export function appendDictation(draft,speech){
 const separator=draft&&speech&&!/\s$/.test(draft)&&!/^\s/.test(speech)?' ':'';
 let take=Math.max(0,Math.min(speech.length,16000-draft.length-separator.length));
 // Keep an entire Unicode character in recovery when only half would fit.
 if(take>0&&take<speech.length&&/[\uD800-\uDBFF]/.test(speech[take-1])&&/[\uDC00-\uDFFF]/.test(speech[take]))take--;
 return take?{text:draft+separator+speech.slice(0,take),remainder:speech.slice(take)}:{text:draft,remainder:speech};
}
