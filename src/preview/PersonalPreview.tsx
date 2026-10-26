import {useState,useSyncExternalStore} from 'react';
import {Camera,RefreshCw} from 'lucide-react';
import type {PersonalState} from '../shared/types';
import {loadSnapshots,selectedSnapshot,snapshotRevision,subscribeSnapshots} from './snapshots';

// Official website content is a timestamped capture, never a separate UI clone.
export function PersonalPreview({state:_state}:{state:PersonalState|null}){
 useSyncExternalStore(subscribeSnapshots,snapshotRevision);
 const {key,snapshot}=selectedSnapshot();const [failed,setFailed]=useState<string|null>(null);
 const url=snapshot?`/__musebench_snapshots/${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`:'';
 return <section className="desktop-snapshot" aria-label="Desktop website snapshot" data-preview-surface="desktop-snapshot">
  <div className="desktop-snapshot-notice"><Camera size={14}/><span><strong>Desktop snapshot · Read-only</strong>{snapshot?<small>Captured {new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.width} × {snapshot.height} · Website content may have changed</small>:<small>Capture this section in the desktop app to preview its actual appearance.</small>}</span><button type="button" className="icon-button" aria-label="Reload desktop snapshots" title="Reload locally captured images" onClick={()=>{setFailed(null);void loadSnapshots();}}><RefreshCw size={14}/></button></div>
  <div className="desktop-snapshot-scroll">{snapshot&&failed!==url?<img key={url} src={url} alt={`Captured ${key} page from the MuseBench desktop app`} width={snapshot.width} height={snapshot.height} onError={()=>setFailed(url)}/>:<div className="desktop-snapshot-empty"><Camera size={30}/><h2>No desktop snapshot for this section</h2><p>Close MuseBench and run <code>npm.cmd run preview:snapshots</code>, then reload snapshots here.</p><p>The native MuseBench sidebar and controls are the same components as desktop. This area displays the provider’s website and requires a capture.</p></div>}</div>
 </section>;
}
