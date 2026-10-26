import {mountApp} from '../ui/bootstrap';
import {createPreviewBridge} from './bridge';
import {PersonalPreview} from './PersonalPreview';
import {renderArtifactHtml} from '../shared/work-artifacts.mjs';
import './preview.css';

if(!import.meta.env.DEV||window.musebench)throw Error('Browser preview must run separately from the desktop app.');
// Shared editors normally retain drafts. A preview reload is an explicit sample reset;
// clear only these sample-origin keys, leaving appearance and desktop storage alone.
try {
 sessionStorage.removeItem('musebench.spaces.noteDrafts.v1');
 sessionStorage.removeItem('musebench.sites.fileDrafts.v1');
 localStorage.removeItem('musebench.sites.setup.v1:sample-site');
}catch { /* Private browsing may block storage; the bridge still works in memory. */ }
window.musebench=createPreviewBridge();
const preview={
 personal:(state:Parameters<typeof PersonalPreview>[0]['state'])=><PersonalPreview key={`${state?.destination}:${state?.library.selectedId??'new'}`} state={state}/>,
 artifact:(artifact:Parameters<typeof renderArtifactHtml>[0],theme:string)=>renderArtifactHtml(artifact,{theme:theme==='light'?'light':'dark'}),
 siteDocument:(url:string)=>{
  const prefix='data:text/html;charset=utf-8,';
  if(!url.startsWith(prefix))return undefined;
  // The sample site's editor can change markup, never access the parent or network.
  try{return '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; form-action &#39;none&#39;; base-uri &#39;none&#39;">'+decodeURIComponent(url.slice(prefix.length));}catch{return undefined;}
 },
};
mountApp(preview);
const caption=document.createElement('div');caption.className='preview-window-caption';caption.setAttribute('aria-label','Windows window controls reference (desktop only)');caption.innerHTML='<span>−</span><span>□</span><span>×</span>';document.body.append(caption);
