import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const MAX_FONT_BYTES=64*1024**2,MAX_TEXT_CHARS=1024**2,MAX_CODEPOINTS=8192;
const code=value=>'U+'+value.toString(16).toUpperCase().padStart(4,'0');
export function centerVideoTitleRaster(raster,width,height){const x=(width-raster.logicalWidth)/2-raster.bleed.left,y=(height-raster.logicalHeight)/2-raster.bleed.top;if(![x,y,raster.width,raster.height].every(Number.isFinite)||x<0||y<0||raster.width>width||raster.height>height||x+raster.width>width||y+raster.height>height)throw Error('Title glyphs do not fit the video frame. Reduce the title size or wrap its text.');return{x,y};}
function visibleCodepoints(texts){if(!Array.isArray(texts)||texts.length>10256||texts.some(t=>typeof t!=='string')||texts.reduce((n,t)=>n+t.length,0)>MAX_TEXT_CHARS)throw Error('Video text exceeds the bounded font coverage limit.');const points=[...new Set(texts.join('').match(/[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu)||[])].map(c=>c.codePointAt(0));if(points.length>MAX_CODEPOINTS)throw Error('Video text uses too many distinct Unicode characters.');return points;}

/** OpenType cmap format4/12, TTC first face. Glyph0 is missing, never coverage.
 * https://learn.microsoft.com/en-us/typography/opentype/spec/cmap */
export function readFontCoverage(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>MAX_FONT_BYTES)throw Error('Invalid or oversized video font.');
 const need=(offset,length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+length>bytes.length)throw Error('Invalid font cmap bounds.');};
 const u16=offset=>{need(offset,2);return bytes.readUInt16BE(offset);},u32=offset=>{need(offset,4);return bytes.readUInt32BE(offset);};
 let face=0;if(bytes.toString('ascii',0,4)==='ttcf'){const count=u32(8);if(!count||count>128)throw Error('Invalid font collection.');face=u32(12);}
 need(face,12);const tables=u16(face+4);if(!tables||tables>256)throw Error('Invalid font table count.');let cmap;
 for(let i=0;i<tables;i++){const entry=face+12+i*16;need(entry,16);if(bytes.toString('ascii',entry,entry+4)==='cmap'){const offset=u32(entry+8),length=u32(entry+12);need(offset,length);cmap={offset,length};}}
 if(!cmap)throw Error('Font has no Unicode cmap.');const base=cmap.offset,count=u16(base+2);if(count>256)throw Error('Invalid font cmap record count.');const subtables=[];
 for(let i=0;i<count;i++){const entry=base+4+i*8,platform=u16(entry),encoding=u16(entry+2);if(platform!==0&&!(platform===3&&[1,10].includes(encoding)))continue;const at=base+u32(entry+4);if(at<base||at>=base+cmap.length)throw Error('Invalid font cmap subtable.');const format=u16(at);if(format===12){const length=u32(at+4),groups=u32(at+12);need(at,length);if(length<16||groups>200000||16+groups*12>length||at+length>base+cmap.length)throw Error('Invalid format12 cmap.');let previous=-1;for(let g=0;g<groups;g++){const row=at+16+g*12,start=u32(row),end=u32(row+4);if(start<=previous||end<start||end>0x10ffff)throw Error('Invalid format12 cmap groups.');previous=end;}subtables.push({format,at,groups});}
  else if(format===4){const length=u16(at+2),segments=u16(at+6)/2;need(at,length);if(!Number.isInteger(segments)||!segments||segments>8192||16+segments*8>length||at+length>base+cmap.length)throw Error('Invalid format4 cmap.');subtables.push({format,at,length,segments});}}
 if(!subtables.length)throw Error('Font lacks a supported Unicode cmap.');subtables.sort((a,b)=>b.format-a.format);
 return point=>{for(const t of subtables){if(t.format===12){let low=0,high=t.groups-1;while(low<=high){const mid=(low+high)>>1,row=t.at+16+mid*12,start=u32(row),end=u32(row+4);if(point<start)high=mid-1;else if(point>end)low=mid+1;else return u32(row+8)+point-start;}}
  else if(point<=0xffff){const end=t.at+14,start=end+t.segments*2+2,delta=start+t.segments*2,ranges=delta+t.segments*2;for(let i=0;i<t.segments;i++){if(point>u16(end+i*2))continue;if(point<u16(start+i*2))break;const shift=u16(delta+i*2),offset=u16(ranges+i*2);if(!offset)return (point+shift)&0xffff;const index=ranges+i*2+offset+2*(point-u16(start+i*2));if(index<t.at||index+2>t.at+t.length)throw Error('Invalid format4 glyph offset.');const glyph=u16(index);return glyph?(glyph+shift)&0xffff:0;}}}return 0;};
}
export async function selectCoveredVideoFonts({texts,fontFiles}){
 const points=visibleCodepoints(texts),missing=new Set(points),selected=[];
 if(!Array.isArray(fontFiles)||fontFiles.length>32)throw Error('Invalid installed font candidate list.');
 for(const filePath of [...new Set(fontFiles.filter(Boolean))]){if(!missing.size)break;if(!path.isAbsolute(filePath))throw Error('Video fonts require trusted absolute paths.');let bytes;try{const info=await lstat(filePath);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_FONT_BYTES)continue;bytes=await readFile(filePath);}catch{continue;}let glyph;try{glyph=readFontCoverage(bytes);}catch{continue;}const covered=[...missing].filter(p=>glyph(p)!==0);if(!covered.length)continue;for(const point of covered)missing.delete(point);selected.push({filePath,name:path.basename(filePath),sha256:createHash('sha256').update(bytes).digest('hex'),coveredCodepoints:covered.map(code),bytes});}
 if(missing.size)throw Error(`No installed video font covers ${[...missing].slice(0,12).map(code).join(', ')}. Install a font supporting these characters before exporting; missing glyphs will not be substituted.`);
 return selected;
}
function installedCandidates(preferred){if(process.platform==='win32'){const dir=path.join(process.env.WINDIR||'C:\\Windows','Fonts');return ['segoeui.ttf',preferred,'msyh.ttc','tahoma.ttf','arial.ttf','seguisym.ttf','seguiemj.ttf','simsun.ttc'].map(p=>p&&path.isAbsolute(p)?p:path.join(dir,p||'__missing__'));}if(process.platform==='darwin')return[preferred,'/System/Library/Fonts/Supplemental/Arial Unicode.ttf','/System/Library/Fonts/Helvetica.ttc'];return[preferred,'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'];}

/** Static text is shaped/rasterized once using explicit per-glyph font fallback.
 * Font buffers are frozen/hash-recorded before registration; no Fontconfig dependency. */
export async function createVideoTextRenderer({texts,preferredFontFile,signal,fontFiles=installedCandidates(preferredFontFile)}={}){
 signal?.throwIfAborted();const selected=await selectCoveredVideoFonts({texts,fontFiles});let canvas;
 try{canvas=await import('@napi-rs/canvas');}catch{throw Error('The native Unicode text renderer is unavailable. Reinstall this MuseBench build before exporting text.');}
 const keys=[],aliases=[],fonts=selected.map(({bytes,filePath,...receipt})=>receipt);
 try{for(const font of selected){signal?.throwIfAborted();const alias='MuseVideo'+randomUUID().replaceAll('-','');const key=canvas.GlobalFonts.register(font.bytes,alias);if(!key)throw Error(`The native text renderer could not load ${font.name}.`);keys.push(key);aliases.push(`"${alias}"`);}}
 catch(error){canvas.GlobalFonts.removeBatch(keys);throw error;}
 let closed=false;const covered=new Set(fonts.flatMap(f=>f.coveredCodepoints));
 return{fonts,async render({text,fontSize,color='#ffffff',background='transparent',maxWidth=1920,padding=0,fixedWidth=false}){
  if(closed)throw Error('Video text renderer is closed.');signal?.throwIfAborted();for(const point of visibleCodepoints([text]))if(!covered.has(code(point)))throw Error(`Video font coverage was not verified for ${code(point)}.`);if(!Number.isFinite(fontSize)||fontSize<1||fontSize>2000||!Number.isFinite(maxWidth)||maxWidth<1||maxWidth>8192||!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)||background!=='transparent'&&!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(background))throw Error('Invalid video text raster settings.');
  const px=typeof padding==='number'?padding:padding.x,py=typeof padding==='number'?padding:padding.y;if(![px,py].every(v=>Number.isFinite(v)&&v>=0&&v<=256))throw Error('Invalid video text padding.');
  const font=`${fontSize}px ${aliases.join(',')}`,measure=canvas.createCanvas(1,1).getContext('2d');measure.font=font;measure.textBaseline='alphabetic';measure.textAlign='center';const lineHeight=fontSize*1.3,lines=String(text).replaceAll('\r','').split('\n');if(lines.length>256)throw Error('Video text has too many lines.');const directions=lines.map(line=>/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(line.match(/[\p{L}\p{N}]/u)?.[0]||'')?'rtl':'ltr');const metrics=lines.map((line,i)=>{measure.direction=directions[i];return measure.measureText(line);}),naturalWidth=Math.max(0,...metrics.map(m=>m.width)),logicalWidth=Math.max(1,Math.ceil((fixedWidth?maxWidth:naturalWidth)+2*px)),logicalHeight=Math.max(1,Math.ceil(lines.length*lineHeight+2*py));
  const minX=Math.min(0,...metrics.map(m=>logicalWidth/2-m.actualBoundingBoxLeft)),maxX=Math.max(logicalWidth,...metrics.map(m=>logicalWidth/2+m.actualBoundingBoxRight)),minY=Math.min(0,...metrics.map((m,i)=>py+fontSize+i*lineHeight-m.actualBoundingBoxAscent)),maxY=Math.max(logicalHeight,...metrics.map((m,i)=>py+fontSize+i*lineHeight+m.actualBoundingBoxDescent));
  const bleed={left:Math.max(0,Math.ceil(-minX)),right:Math.max(0,Math.ceil(maxX-logicalWidth)),top:Math.max(0,Math.ceil(-minY)),bottom:Math.max(0,Math.ceil(maxY-logicalHeight))},width=logicalWidth+bleed.left+bleed.right,height=logicalHeight+bleed.top+bleed.bottom;
  if(naturalWidth>maxWidth||width>8192||height>8192||width*height>16*1024**2||![width,height,...Object.values(bleed)].every(Number.isSafeInteger))throw Error('Video text raster exceeds its safe width or pixel limit. Shorten or wrap this text.');
  const image=canvas.createCanvas(width,height),context=image.getContext('2d');if(background!=='transparent'){context.fillStyle=background;context.fillRect(bleed.left,bleed.top,logicalWidth,logicalHeight);}context.font=font;context.fillStyle=color;context.textBaseline='alphabetic';context.textAlign='center';
  for(let i=0;i<lines.length;i++){context.direction=directions[i];context.fillText(lines[i],logicalWidth/2+bleed.left,py+fontSize+i*lineHeight+bleed.top);}signal?.throwIfAborted();const png=await image.encode('png');signal?.throwIfAborted();return{png,width,height,logicalWidth,logicalHeight,bleed,lineHeight,lines,fonts};
 },close(){if(!closed){closed=true;canvas.GlobalFonts.removeBatch(keys);}}};
}
