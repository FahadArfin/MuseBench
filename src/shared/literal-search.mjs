// Case-folded matching with offsets in the original UTF-16 string, including
// characters such as U+0130 whose lowercase representation expands.
export function literalIndex(text,query,offset=0){
 const source=text.slice(offset),folded=source.toLowerCase(),index=folded.indexOf(query.toLowerCase());if(index<0)return -1;
 if(source.length===folded.length)return offset+index;
 let original=0,normalized=0;for(const character of source){const size=character.toLowerCase().length;if(normalized+size>index)return offset+original;normalized+=size;original+=character.length;}return offset+original;
}
