import {useEffect,useState} from 'react';
import type {WorkManagedAsset} from '../../shared/work-job-types';
import './work-assets-jobs.css';
export interface WorkAssetBrowserProps {
 itemId:string;assets:WorkManagedAsset[];onImport:()=>Promise<void>;onDropFiles?:(files:File[])=>Promise<void>;
 onRename:(assetId:string,name:string)=>Promise<void>;onRelink:(assetId:string)=>Promise<void>;onRemove:(assetId:string)=>Promise<void>;
 onInsert?:(assetId:string)=>void;onFavorite?:(assetId:string,favorite:boolean)=>Promise<void>;onUse?:(assetId:string)=>Promise<void>;
 resolveAsset?:(assetId:string,thumbnail?:boolean)=>string;busy?:boolean;error?:string|null;
}
export function WorkAssetBrowser({itemId,assets,onImport,onDropFiles,onRename,onRelink,onRemove,onInsert,onFavorite,onUse,resolveAsset,busy=false,error}:WorkAssetBrowserProps){
 const[view,setView]=useState<'grid'|'list'>('grid'),[search,setSearch]=useState(''),[renaming,setRenaming]=useState<string|null>(null),[name,setName]=useState(''),[removing,setRemoving]=useState<string|null>(null),[pending,setPending]=useState(false),[failure,setFailure]=useState<string|null>(null),[favorites,setFavorites]=useState(false),[recent,setRecent]=useState(false);
 useEffect(()=>{setRenaming(null);setRemoving(null);setSearch('');setFailure(null);},[itemId]);
 async function perform(action:()=>Promise<void>){setPending(true);setFailure(null);try{await action();}catch(reason){setFailure(reason instanceof Error?reason.message:'The asset action failed. Try again.');}finally{setPending(false);}}
 const locked=busy||pending,filtered=assets.filter(asset=>(!favorites||asset.favorite)&&asset.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a,b)=>recent?(b.lastUsedAt||b.addedAt||'').localeCompare(a.lastUsedAt||a.addedAt||''):0);
 return <section className="work-asset-browser" aria-label="Project assets" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=onDropFiles&&!locked?'copy':'none';}} onDrop={event=>{event.preventDefault();if(locked)return;const files=Array.from(event.dataTransfer.files);if(!files.length){setFailure('Drop files from your computer to import them.');return;}if(!onDropFiles){setFailure('File drop is unavailable here. Use Import files to choose local files.');return;}void perform(()=>onDropFiles(files));}}>
  <div className="work-asset-heading"><h3>Assets <small>{assets.length}</small></h3><button type="button" disabled={locked} onClick={()=>void perform(onImport)}>Import files</button></div>
  <p className="work-job-muted">{onDropFiles?'Drop local files here or choose Import files.':'Choose local files with Import files.'} Originals stay unchanged.</p>
  <div className="work-asset-controls"><input aria-label="Search assets" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search assets"/>
   <div role="group" aria-label="Asset filters"><button type="button" aria-pressed={favorites} onClick={()=>setFavorites(!favorites)}>Favorites</button><button type="button" aria-pressed={recent} onClick={()=>setRecent(!recent)}>Recent</button></div>
   <div role="group" aria-label="Asset view"><button type="button" aria-pressed={view==='grid'} onClick={()=>setView('grid')}>Grid</button><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}>List</button></div></div>
  {(failure||error)&&<p role="alert" className="work-job-error">{failure||error}</p>}
  <div className={`work-asset-items ${view}`} aria-busy={locked}>{filtered.map(asset=><article key={asset.id} className={asset.missing?'work-asset-missing':''}>
   <button className="work-asset-preview" type="button" aria-label={`Insert ${asset.name}`} disabled={locked||asset.missing||!onInsert} onClick={()=>{onInsert?.(asset.id);if(onUse)void perform(()=>onUse(asset.id));}}>
    {resolveAsset&&!asset.missing&&asset.mediaType.startsWith('image/')?<img src={resolveAsset(asset.id,true)} alt="" loading="lazy"/>:<span>{asset.missing?'Missing file':asset.mediaType.startsWith('audio/')?'Audio':asset.mediaType.startsWith('video/')?'Video':'File'}</span>}
   </button>
   <div className="work-asset-details">{renaming===asset.id?<form onSubmit={event=>{event.preventDefault();void perform(async()=>{await onRename(asset.id,name);setRenaming(null);});}}><input autoFocus aria-label="Asset name" value={name} maxLength={200} onChange={event=>setName(event.target.value)}/><button disabled={locked||!name.trim()} type="submit">Save name</button><button type="button" onClick={()=>setRenaming(null)}>Cancel</button></form>:<strong title={asset.name}>{asset.name}</strong>}
   <span className="work-job-muted">{asset.width&&asset.height?`${asset.width} x ${asset.height} / `:''}{(asset.bytes/1024/1024).toFixed(1)} MiB / {asset.usageCount??0} uses</span>
   <div className="work-asset-actions">{onFavorite&&<button type="button" aria-pressed={!!asset.favorite} aria-label={`${asset.favorite?'Unfavorite':'Favorite'} ${asset.name}`} disabled={locked} onClick={()=>void perform(()=>onFavorite(asset.id,!asset.favorite))}>{asset.favorite?'Starred':'Star'}</button>}<button disabled={locked} type="button" onClick={()=>{setRenaming(asset.id);setName(asset.name);}}>Rename</button><button disabled={locked} type="button" onClick={()=>void perform(()=>onRelink(asset.id))}>{asset.missing?'Relink':'Replace'}</button><button disabled={locked} type="button" onClick={()=>setRemoving(asset.id)}>Remove</button></div>
   {removing===asset.id&&<div className="work-asset-remove" role="group" aria-label={`Remove ${asset.name}`}><p>{asset.usageCount?`${asset.usageCount} objects use this asset. They will keep their image, and existing versions retain the original bytes.`:'Remove this asset from the browser? Existing versions retain its original bytes.'}</p><button disabled={locked} type="button" onClick={()=>void perform(async()=>{await onRemove(asset.id);setRemoving(null);})}>Remove from browser</button><button type="button" onClick={()=>setRemoving(null)}>Keep asset</button></div>}</div>
  </article>)}</div>{!filtered.length&&<p className="work-job-muted">{assets.length?'No matching assets.':'Import an image or media file to reuse it in this project.'}</p>}
 </section>;
}

