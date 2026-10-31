import type {RuntimeState} from '../shared/types';
import {nativeRetryText} from '../shared/native-retry.mjs';
import './native-retry.css';
export function NativeRetryStatus({runtime}:{runtime:RuntimeState}){
 const text=runtime.status==='running'&&runtime.sessionId&&runtime.turnId?nativeRetryText(runtime.nativeRetry):null;
 return text?<p className="native-retry-status" role="status" aria-label="Muse retry status" aria-live="polite" aria-atomic="true">{text}</p>:null;
}
