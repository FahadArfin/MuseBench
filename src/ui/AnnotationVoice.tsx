import {Mic,Square,X} from 'lucide-react';
import type {useDictation} from './useDictation';
export function AnnotationVoice({voice,label,disabled=false}:{voice:ReturnType<typeof useDictation>;label:string;disabled?:boolean}){
 return <div className="annotation-voice">
  <button type="button" className={`preview-comment-voice ${voice.recording?'recording':''}`} aria-label={voice.recording?`Stop dictating ${label}`:`Dictate ${label}`} disabled={disabled||!window.musebench?.dictation||voice.state.status==='stopping'||(!voice.recording&&(voice.state.available===false||!!voice.recoveryError))} onClick={()=>void voice.toggle()}>{voice.recording?<Square size={13}/>:<Mic size={14}/>} {voice.recording?'Stop dictation':'Dictate'}</button>
  {voice.recording&&<button type="button" className="icon-button" aria-label={`Cancel dictation for ${label}`} onClick={voice.cancel}><X size={13}/></button>}
  {(voice.state.error||voice.hint)&&<small role="status">{voice.state.error||voice.hint}</small>}
  {voice.overflow&&<div className="annotation-voice-overflow"><label>Extra dictated text<textarea aria-label={`Extra speech for ${label}`} value={voice.overflow} readOnly rows={2}/></label><button type="button" disabled={voice.recording} onClick={voice.reinsert}>Add remaining speech</button><button type="button" onClick={voice.dismissOverflow}>Discard extra speech</button></div>}
  {voice.recoveryError&&<small role="alert">{voice.recoveryError}<button type="button" onClick={voice.retryRecovery}>Retry saving speech</button></small>}
 </div>;
}
