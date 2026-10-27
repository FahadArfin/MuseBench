// Only inspect rendered sign-in indicators; never read cookies or credential storage.
export async function readPersonalAuth(contents){
 if(!contents||contents.isDestroyed()||contents.isLoadingMainFrame?.())return 'unknown';
 let timer;
 try{const result=await Promise.race([contents.executeJavaScript(`(${function(){
  if(!['https://muse.ai','https://www.meta.ai','https://meta.ai'].includes(location.origin))return 'required';
  if(document.querySelector('[data-hatch-dock],[data-hatch-avatar-host]'))return 'ready';
  const controls=[...document.querySelectorAll('button,a,[role="button"]')];
  if(controls.some(e=>/^(log out|sign out)$/i.test((e.textContent||e.getAttribute('aria-label')||'').trim())))return 'ready';
  if(document.querySelector('input[type="password"],form[action*="login"]')||controls.some(e=>/^(log in|sign in|log in with.*|continue with (facebook|instagram|meta).*)$/i.test((e.textContent||'').trim())))return 'required';
  return 'unknown';
 }.toString()})()`),new Promise(resolve=>{timer=setTimeout(()=>resolve('unknown'),1500);timer.unref?.();})]);return ['ready','required','unknown'].includes(result)?result:'unknown';}catch{return 'unknown';}finally{clearTimeout(timer);}
}
