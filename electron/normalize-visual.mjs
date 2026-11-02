/** Decode only after the host has validated source headers and dimensions. */
export function createVisualNormalizer(nativeImage,{decodeWebp}={}){
 return async(bytes,metadata)=>{
  const {width,height}=metadata??{};
  if(!Buffer.isBuffer(bytes)||bytes.length>20*1024*1024||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=16384)||width*height>40000000)throw Error('Image dimensions exceed the visual inspection limit.');
  let image=nativeImage.createFromBuffer(bytes);
  // nativeImage's Windows codecs do not decode WebP. Chromium does; keep that
  // fallback in an isolated world in our own UI, never in a provider webpage.
  if(image.isEmpty()&&metadata.mimeType==='image/webp'&&decodeWebp){
   const converted=await decodeWebp('data:image/webp;base64,'+bytes.toString('base64'));
   if(converted?.originalWidth!==width||converted?.originalHeight!==height||typeof converted.imageDataUrl!=='string'||converted.imageDataUrl.length>10*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(converted.imageDataUrl))throw Error('WebP conversion could not be verified.');
   image=nativeImage.createFromBuffer(Buffer.from(converted.imageDataUrl.split(',')[1],'base64'));
   if(image.isEmpty()||image.getSize().width!==converted.width||image.getSize().height!==converted.height)throw Error('WebP conversion could not be decoded.');
   if(converted.width>width||converted.height>height)throw Error('Invalid WebP conversion dimensions.');
   return{imageDataUrl:image.toDataURL(),mimeType:'image/png',width:converted.width,height:converted.height,originalWidth:width,originalHeight:height,resized:converted.width!==width||converted.height!==height};
  }
  if(image.isEmpty())throw Error('This image could not be decoded.');
  const original=image.getSize();if(original.width!==width||original.height!==height)throw Error('Image dimensions changed during decoding.');
  const scale=Math.min(1,2048/width,2048/height);
  if(scale<1)image=image.resize({width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),quality:'good'});
  let png=image.toPNG();
  for(let attempt=0;png.length>7*1024*1024&&attempt<8;attempt++){
   const size=image.getSize();image=image.resize({width:Math.max(1,Math.floor(size.width*.75)),height:Math.max(1,Math.floor(size.height*.75)),quality:'good'});png=image.toPNG();
  }
  if(!png.length||png.length>7*1024*1024)throw Error('Image exceeds the visual output limit.');
  const delivered=image.getSize();
  return{imageDataUrl:'data:image/png;base64,'+png.toString('base64'),mimeType:'image/png',width:delivered.width,height:delivered.height,originalWidth:width,originalHeight:height,resized:delivered.width!==width||delivered.height!==height};
 };
}

// Serialized as fixed trusted code into the app's isolated renderer world.
// This function must remain self-contained and only decode the supplied data URL.
export async function decodeVisualInRenderer(dataUrl){
 if(typeof dataUrl!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)||dataUrl.length>28*1024*1024)throw Error('Invalid WebP image.');
 const image=new Image(),canvas=document.createElement('canvas');let timer;
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>{image.onload=null;image.onerror=null;image.src='';reject(Error('Image decoding timed out.'));},4000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('This WebP image could not be decoded.'));};image.src=dataUrl;});
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width>16384||height>16384||width*height>40000000)throw Error('Image exceeds the pixel limit.');
  const scale=Math.min(1,2048/width,2048/height);let deliveredWidth=Math.max(1,Math.round(width*scale)),deliveredHeight=Math.max(1,Math.round(height*scale)),png;
  for(let attempt=0;attempt<9;attempt++){
   canvas.width=deliveredWidth;canvas.height=deliveredHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image decoder unavailable.');ctx.drawImage(image,0,0,deliveredWidth,deliveredHeight);png=canvas.toDataURL('image/png');
   if(png.length<=(7*1024*1024/3)*4+32)return{imageDataUrl:png,width:deliveredWidth,height:deliveredHeight,originalWidth:width,originalHeight:height};
   deliveredWidth=Math.max(1,Math.floor(deliveredWidth*.75));deliveredHeight=Math.max(1,Math.floor(deliveredHeight*.75));
  }
  throw Error('Image exceeds the output limit.');
 }finally{clearTimeout(timer);image.onload=null;image.onerror=null;image.src='';canvas.width=0;canvas.height=0;}
}
