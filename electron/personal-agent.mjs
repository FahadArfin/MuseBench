// Read only the agent's rendered profile, never the user's account avatar or chats.
export function normalizeAgentProfile(value){
 const name=typeof value?.name==='string'?value.name.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80):'';
 const avatar=typeof value?.avatar==='string'&&value.avatar.length<=60000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.avatar)?value.avatar:null;
 return {name:name||'Muse',avatar};
}
export async function readAgentProfile(contents){
 try{
  if(!contents||contents.isDestroyed())return null;
  const url=new URL(contents.getURL());if(url.origin!=='https://muse.ai'||url.username||url.password)return null;
  const value=await contents.executeJavaScript(`(${function(){
   if(location.origin!=='https://muse.ai')return null;
   const host=document.querySelector('[data-hatch-avatar-host]');
   const stage=document.querySelector('[data-hatch-avatar-stage="chat-nav"]');
   if(!host&&!stage)return null;
   const named=host?.querySelector('[data-hatch-avatar-accessory="status-pill"][aria-label]');
   const name=named?.getAttribute('aria-label')||document.querySelector('[data-hatch-speech-bubble-name-visible][title]')?.getAttribute('title')||stage?.querySelector('span[title]')?.getAttribute('title')||'Muse';
   const media=[...document.querySelectorAll('[data-hatch-avatar-interaction] img[data-hatch-avatar-layer="ready"],[data-hatch-avatar-interaction] video[data-hatch-avatar-layer="ready"]')];
   const img=media.find(e=>e.tagName==='IMG'&&e.complete&&e.naturalWidth)||media.find(e=>e.tagName==='VIDEO'&&e.readyState>=2&&e.videoWidth);
   let avatar=null;
   if(img){try{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const context=canvas.getContext('2d');const width=img.naturalWidth||img.videoWidth,height=img.naturalHeight||img.videoHeight,size=Math.min(width,height);context.drawImage(img,(width-size)/2,(height-size)/2,size,size,0,0,64,64);avatar=canvas.toDataURL('image/png');}catch{/* Keep the name when the site's image cannot be copied safely. */}}
   return {name,avatar};
  }.toString()})()`);
  return value?normalizeAgentProfile(value):null;
 }catch{return null;}
}
