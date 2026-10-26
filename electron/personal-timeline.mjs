import {mountPromptTimeline} from '../src/shared/prompt-timeline.mjs';
import {resolvePersonalAppearance} from './personal-appearance.mjs';
export async function applyPersonalTimeline(contents,enabled,appearance){
 if(!contents||contents.isDestroyed())return false;
 let origin;try{const url=new URL(contents.getURL());if(url.username||url.password)return false;origin=url.origin;}catch{return false;}
 if(!['https://muse.ai','https://www.meta.ai','https://meta.ai'].includes(origin))return false;
 const {color}=resolvePersonalAppearance(appearance);
 const script=`(${function install(mount,enabled,colors){
  const key='__musebenchPromptTimeline';window[key]?.dispose();delete window[key];
  if(!enabled||!['https://muse.ai','https://www.meta.ai','https://meta.ai'].includes(location.origin))return false;
  let host=null,dispose=null,root=null,timer=null;
  function sync(){
   timer=null;
   // Meta's public client uses these same explicit message roles. Its composer
   // test ID guards the supported chat layout; auth pages are never adapted.
   const next=document.querySelector('[role="dialog"][aria-modal="true"]')?null:location.origin==='https://muse.ai'
    ?document.querySelector('[data-hatch-chat-content] [role="log"][data-hatch-chat-column]')
    :document.querySelector('[data-testid="composer-input"]')?document.querySelector('main,[role="main"]'):null;
   if(next===root)return;dispose?.();host?.remove();host=null;dispose=null;root=next;
   if(!root)return;
   host=document.createElement('div');host.setAttribute('data-musebench-timeline','');host.style.setProperty('--text',colors.text);host.style.setProperty('--muted',colors.muted);host.style.setProperty('--surface-hover',colors.hover);document.body.append(host);
   dispose=mount({host,root,userSelector:'[data-message-item][data-message-role="user"]',answerSelector:'[data-message-item][data-message-role="assistant"]'});
  }
  const observer=new MutationObserver(()=>{if(timer===null)timer=setTimeout(sync,150);});observer.observe(document.body,{subtree:true,childList:true});sync();
  window[key]={dispose(){clearTimeout(timer);observer.disconnect();dispose?.();host?.remove();}};
  return true;
 }.toString()})(${mountPromptTimeline.toString()},${JSON.stringify(enabled===true)},${JSON.stringify(color)})`;
 try{return await contents.executeJavaScript(script)===true;}catch{return false;}
}
