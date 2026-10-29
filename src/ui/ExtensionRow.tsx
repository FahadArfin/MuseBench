import type {ReactNode} from 'react';
import {ChevronRight,Ellipsis,Plus,RefreshCw,Search} from 'lucide-react';
import {ExtensionIcon} from './ExtensionIcon';
import type {ExtensionKind} from '../shared/extension-catalog-types';

export function ExtensionRow({id,title,summary,kind,icon,status,installed=false,setup=false,onClick}: {
 id:string;title:string;summary:string;kind:ExtensionKind;icon?:string;status?:string;installed?:boolean;setup?:boolean;onClick:()=>void;
}) {
 return <button type="button" className="catalog-card" data-catalog-id={id} aria-label={`${installed?'Manage':'View'} ${title}`} aria-description={[summary,status].filter(Boolean).join(' ')} onClick={onClick}>
  <ExtensionIcon icon={icon} title={title} kind={kind}/>
  <span className="catalog-item-copy"><span className="catalog-item-title">{title}</span><span className="catalog-item-summary">{summary}</span>{status&&<span className="catalog-item-status">{status}</span>}</span>
  <span className="catalog-item-action" aria-hidden="true">{installed?<Ellipsis size={17}/>:setup?<ChevronRight size={16}/>:<Plus size={18}/>}</span>
 </button>;
}

export type DirectoryView='recommended'|'community'|'installed';
export function CatalogToolbar({view,onView,query,onQuery,onSearch,onRefresh,refreshing=false,kind,children}: {
 view:DirectoryView;onView:(view:DirectoryView)=>void;query:string;onQuery:(query:string)=>void;onSearch:()=>void;onRefresh?:()=>void;refreshing?:boolean;kind:ExtensionKind;children?:ReactNode;
}) {
 return <div className="catalog-controls">
  <div className="catalog-sources" role="group" aria-label="Extension view">{([['recommended','Curated'],['community','Community'],['installed',kind==='hooks'?'Project hooks':'Installed']] as const).map(([id,label])=><button key={id} type="button" className={view===id?'active':''} aria-pressed={view===id} onClick={()=>onView(id)}>{label}</button>)}</div>
  {children}
  <form className="catalog-search" onSubmit={event=>{event.preventDefault();onSearch();}}><div className="extensions-filter"><Search size={15}/><input aria-label={view==='installed'?'Search extensions':'Search catalog'} placeholder={`Search ${kind==='mcp'?'servers':kind}…`} maxLength={200} value={query} onChange={e=>onQuery(e.target.value)}/></div><button className="icon-button" aria-label="Search" title="Search"><ChevronRight size={16}/></button>{onRefresh&&<button type="button" className="icon-button" aria-label="Refresh catalog" title="Refresh catalog" disabled={refreshing} onClick={onRefresh}><RefreshCw size={15} className={refreshing?'spin':''}/></button>}</form>
 </div>;
}
