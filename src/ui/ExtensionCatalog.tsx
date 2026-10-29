import {useSurfaceMotion} from './useSurfaceMotion';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight,LoaderCircle} from 'lucide-react';
import type {CatalogEntry,CatalogPage,ExtensionKind} from '../shared/extension-catalog-types';
import type {CustomizeCommand} from '../shared/customize-types';
import {ExtensionIcon} from './ExtensionIcon';
import {CatalogToolbar,ExtensionRow} from './ExtensionRow';
import './extension-catalog.css';

const labels={recipe:'Server recipe · not connected',unverified:'Discovered · validation required','setup-required':'Setup required',template:'Editable project template'};
const kindLabels={skills:'skills',plugins:'plugins',mcp:'MCP servers',connectors:'connectors',hooks:'hooks'};
const CURATED_LIMIT=1000;
const categoryLabels:Record<string,string>={'developer-tools':'Developer tools',productivity:'Productivity',design:'Design & creative',business:'Business',data:'Data & databases',documents:'Documents & knowledge',workflows:'Workflows & automation',research:'Research & learning',quality:'Quality & accessibility',cloud:'Cloud & operations',ai:'AI & agents'};
type DirectoryEntry=CatalogEntry&{category?:string;icon?:string;popular?:boolean;summary?:string};
type InstalledServer={name:string;address?:string};
type Props={kind:ExtensionKind;disabled:boolean;simulation:boolean;execute:(command:CustomizeCommand)=>Promise<void>;onHook:(item:CatalogEntry)=>void;onManageServer?:(name:string)=>void;installedServers?:InstalledServer[];source:'recommended'|'community';onSource:(source:'recommended'|'community')=>void;onInstalled:()=>void;query:string;onQuery:(query:string)=>void;cache:Map<string,CatalogPage>};

function categoryFor(item:DirectoryEntry){
 if(item.category)return categoryLabels[item.category]??item.category;
 const words=[item.title,...item.tags].join(' ').toLowerCase();
 if(/pdf|docx|pptx|xlsx|document|spreadsheet|presentation|office|drive/.test(words))return 'Documents & knowledge';
 if(/figma|design|frontend|canva|image/.test(words))return 'Design & creative';
 if(/slack|gmail|mail|calendar|contact|outlook|communication/.test(words))return 'Communication & productivity';
 if(/security|sentry|review|test|playwright/.test(words))return 'Quality & security';
 if(/cloud|vercel|supabase|database|stripe/.test(words))return 'Cloud & data';
 return item.kind==='hooks'?'Project automation':item.kind==='connectors'?'Apps & services':'Developer tools';
}
function summaryFor(item:DirectoryEntry){
 const summary=item.summary?.trim()||item.description.trim();
 return summary||`Explore ${item.title} tools and workflows.`;
}
function sameEndpoint(address:string|undefined,url:string){
 try{return !!address&&new URL(address).href===new URL(url).href;}catch{return false;}
}
function appendPage(previous:CatalogPage|undefined,next:CatalogPage):CatalogPage{
 const known=new Set(previous?.entries.map(item=>item.id)??[]);
 const entries=[...(previous?.entries??[]),...next.entries.filter(item=>!known.has(item.id))];
 const clipped=entries.length>CURATED_LIMIT;
 return {...next,entries:entries.slice(0,CURATED_LIMIT),nextCursor:clipped?null:next.nextCursor,stale:!!previous?.stale||next.stale,offline:!!previous?.offline||next.offline,errors:[...new Set([...(previous?.errors??[]),...next.errors,...(clipped?['Showing the first 1,000 results. Search to narrow the directory.']:[])])]};
}

export function ExtensionCatalog({kind,disabled,simulation,execute,onHook,onManageServer,installedServers=[],source,onSource,onInstalled,query,onQuery:setQuery,cache}:Props){
 const [submittedQuery,setSubmittedQuery]=useState(query.trim());
 const cacheKey=(value=source,search=query.trim())=>`${kind}:${value}:${search}`;
 const [page,setPage]=useState<CatalogPage|undefined>(()=>cache.get(cacheKey())),[selected,setSelected]=useState<DirectoryEntry>();
 const [section,setSection]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false);
 const sequence=useRef(0),searchedQuery=useRef(''),cursorHistory=useRef(new Set<string>()),sectionHeading=useRef<HTMLHeadingElement>(null),directoryRoot=useRef<HTMLElement>(null),detailHeading=useRef<HTMLHeadingElement>(null);
 const sentinel=useRef<HTMLDivElement>(null),pending=useRef(false),scrollPosition=useRef(0);
 const debounce=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);

 useSurfaceMotion(directoryRoot,`${source}:${section??''}:${selected?.id??''}`);

 async function search(nextSource=source,cursor?:string,refresh=false,queryOverride?:string){
  const submitted=cursor?searchedQuery.current:(queryOverride??query).trim();
  if(cursor&&pending.current)return;
  const revalidating=refresh&&!cursor&&nextSource===source&&submitted===submittedQuery&&!!page;
  const loadedExtent=revalidating?page!.entries.length:0,previousCursors=new Set(cursorHistory.current);
  const scroller=directoryRoot.current?.closest<HTMLElement>('.extensions-content');
  const scrollTop=scroller?.scrollTop??0;
  const anchor=revalidating&&scroller?[...scroller.querySelectorAll<HTMLElement>('[data-catalog-id]')].find(row=>row.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top):undefined;
  const anchorId=anchor?.dataset.catalogId,anchorTop=anchor?.getBoundingClientRect().top;
  if(!cursor){clearTimeout(debounce.current);searchedQuery.current=submitted;cursorHistory.current=new Set();setSection(undefined);}
  const ticket=++sequence.current;
  pending.current=true;setBusy(true);setError('');
  let collected=cursor?page:undefined,nextCursor=cursor;
  const visited=new Set(cursorHistory.current);
  try{
   // Curated categories cover the whole local directory, including entries beyond its first page.
   // Community queries stay explicitly paginated so browsing does not issue an unbounded remote crawl.
   for(let request=0;request<200;request++){
    if(nextCursor)visited.add(nextCursor);
    // GitHub sources are complete collections: refresh them once, then page the
    // refreshed cache. Registry cursors each represent a different remote page.
    const result=await window.musebench?.customize({type:'catalogSearch',kind,query:submitted,source:nextSource,cursor:nextCursor,refresh:refresh&&(request===0||kind==='mcp'||kind==='connectors')});
    if(ticket!==sequence.current)return;
    if(!result?.catalog)throw Error('Catalog unavailable. Try again.');
    collected=appendPage(collected,result.catalog);
    nextCursor=collected.nextCursor??undefined;
    if(nextCursor&&collected.entries.length>=CURATED_LIMIT){collected={...collected,nextCursor:null,errors:[...collected.errors,'Showing the first 1,000 results. Search to narrow the directory.']};break;}
    if(nextCursor&&visited.has(nextCursor)){collected={...collected,nextCursor:null};throw Error('The catalog returned a repeated page. Try refreshing.');}
    if(!nextCursor||(nextSource==='community'&&collected.entries.length>=loadedExtent))break;
    if(request===199){collected={...collected,nextCursor:null,errors:[...collected.errors,'The directory is larger than expected. Search to narrow your results.']};}
   }
   cursorHistory.current=visited;setPage(collected);setSubmittedQuery(submitted);
   if(collected){cache.set(cacheKey(nextSource,submitted),collected);while(cache.size>30)cache.delete(cache.keys().next().value!);}
   if(revalidating&&scroller)requestAnimationFrame(()=>{
    if(ticket!==sequence.current)return;
    const restored=anchorId?scroller.querySelector<HTMLElement>(`[data-catalog-id="${CSS.escape(anchorId)}"]`):null;
    if(restored&&anchorTop!==undefined)scroller.scrollTop+=restored.getBoundingClientRect().top-anchorTop;
    else scroller.scrollTop=scrollTop;
   });
  }catch(err){
   if(ticket===sequence.current){cursorHistory.current=revalidating?previousCursors:visited;if(collected&&!revalidating)setPage(collected);setError(err instanceof Error?err.message:String(err));}
  }finally{if(ticket===sequence.current){pending.current=false;setBusy(false);}}
 }
 useEffect(()=>{pending.current=false;setBusy(false);cursorHistory.current=new Set();setSelected(undefined);setSection(undefined);setError('');const saved=cache.get(cacheKey());searchedQuery.current=query.trim();setSubmittedQuery(query.trim());setPage(saved);if(!saved)void search(source);return()=>{sequence.current++;pending.current=false;clearTimeout(debounce.current);};},[kind,source]);
 useEffect(()=>{if(query.trim()===searchedQuery.current)return;debounce.current=setTimeout(()=>void search(source),300);return()=>clearTimeout(debounce.current);},[query,source]);
 useEffect(()=>{
  const target=sentinel.current,root=directoryRoot.current?.closest('.extensions-content');
  if(!target||!page?.nextCursor||busy||error||selected||source!=='community')return;
  const observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting))void search(source,page.nextCursor!);},{root,rootMargin:'240px'});
  observer.observe(target);return()=>observer.disconnect();
 },[page,busy,error,selected,source]);
 function chooseSource(value:'recommended'|'community'){setSelected(undefined);directoryRoot.current?.closest('.extensions-content')?.scrollTo({top:0});if(value===source)void search(value);else onSource(value);}
 async function external(url:string){try{await window.musebench?.openExternal(url);}catch(err){setError(err instanceof Error?err.message:String(err));}}
 function viewItem(item:DirectoryEntry){scrollPosition.current=directoryRoot.current?.closest('.extensions-content')?.scrollTop??0;setSelected(item);setReviewed(false);setError('');requestAnimationFrame(()=>{directoryRoot.current?.closest('.extensions-content')?.scrollTo({top:0});detailHeading.current?.focus({preventScroll:true});});}
 function backToDiscovery(){const id=selected?.id;setSelected(undefined);setReviewed(false);setError('');requestAnimationFrame(()=>{directoryRoot.current?.closest('.extensions-content')?.scrollTo({top:scrollPosition.current});if(id)directoryRoot.current?.querySelector<HTMLButtonElement>(`[data-catalog-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});});}
 function showSection(value?:string){setSection(value);requestAnimationFrame(()=>sectionHeading.current?.focus());}
 function configuredServer(item:CatalogEntry){
  if(item.recipe?.transport!=='http')return undefined;
  const recipe=item.recipe;
  return installedServers.find(server=>server.name===recipe.name&&sameEndpoint(server.address,recipe.url));
 }
 const entries=(page?.entries??[]) as DirectoryEntry[];
 const groups=useMemo(()=>{
  const grouped=new Map<string,DirectoryEntry[]>();
  for(const item of entries){const category=categoryFor(item);grouped.set(category,[...(grouped.get(category)??[]),item]);}
  return [...grouped].map(([title,items])=>({title,items}));
 },[page]);
 const popular=entries.filter(item=>item.popular);
 const sections=[...(popular.length?[{title:'Popular',items:popular}]:[]),...groups];
 const activeSection=section?sections.find(group=>group.title===section):undefined;
 const selectedServer=selected?configuredServer(selected):undefined;

 if(selected)return <><CatalogToolbar kind={kind} view={source} onView={value=>value==='installed'?onInstalled():chooseSource(value)} query={query} onQuery={setQuery} onSearch={()=>{setSelected(undefined);void search();}}/><section className="catalog-detail" aria-label={`${selected.title} details`} ref={directoryRoot}>
  <button className="text-link catalog-back" onClick={backToDiscovery}><ChevronLeft size={15}/>Back to discovery</button>
  <div className="catalog-detail-heading"><ExtensionIcon icon={selected.icon} title={selected.title} kind={selected.kind}/><div><h3 ref={detailHeading} tabIndex={-1}>{selected.title}</h3><span className="catalog-detail-publisher">{selected.publisher}</span></div><span className="catalog-badge">{selectedServer?'Configured · readiness not verified':labels[selected.compatibility]}</span></div>
  <p>{selected.description}</p>
  <dl><dt>Publisher / source</dt><dd>{selected.publisher} · {selected.provenance.source}</dd><dt>Revision</dt><dd>{selected.provenance.version??selected.provenance.ref??selected.package?.ref??'Resolved to a pinned revision during preparation'}</dd><dt>Setup and dependencies</dt><dd>{selected.setup}</dd><dt>Destination</dt><dd>{selected.hook?'Current project draft; review and save required':'Personal Muse configuration; applies to future runs'}</dd><dt>Operation</dt><dd>{selected.package?'Download selected package, inspect files and validation, then review installation. Executable capabilities need their own approval.':selected.recipe?(selected.recipe.transport==='npm'?'Save a pinned local server launcher. First use downloads the specified npm package with install scripts disabled, then runs it as your Windows account. Node.js and npm are required; adding does not verify server readiness.':'Save this exact server configuration after review. Saving does not verify connectivity or sign-in.'):selected.hook?'Load an editable, unapproved hook draft.':'Follow the publisher’s setup instructions. No automatic installation is available.'}</dd></dl>
  {selected.recipe&&<pre className="catalog-config">{selected.recipe.name}{'\n'}{selected.recipe.transport} · {selected.recipe.transport==='npm'?`${selected.recipe.package}@${selected.recipe.version}`:selected.recipe.url}</pre>}
  {selected.hook&&<pre className="catalog-config">{selected.hook.event}{'\n'}{selected.hook.command}</pre>}
  <p className="extensions-help">Review the upstream license and requirements. A directory listing is not a compatibility certification.</p>
  <button className="text-link" onClick={()=>void external(selected.homepage)}>Publisher instructions and licensing<ArrowUpRight size={13}/></button>
  {selected.provenance.url!==selected.homepage&&<button className="text-link" onClick={()=>void external(selected.provenance.url)}>View catalog source<ArrowUpRight size={13}/></button>}
  {error&&<p role="alert" className="extensions-alert error">{error}</p>}
  <div className="catalog-detail-actions">{selectedServer&&onManageServer?<button className="button primary" disabled={disabled} onClick={()=>onManageServer(selectedServer.name)}>Manage server</button>:selected.recipe&&selected.compatibility==='recipe'?<>
   <label className="extensions-consent"><input type="checkbox" checked={reviewed} disabled={disabled} onChange={e=>setReviewed(e.target.checked)}/>{selected.recipe.transport==='npm'?'I approve this pinned package and local execution as my Windows account, outside the project sandbox.':'I approve this endpoint and its access. Tools may receive data outside the project sandbox.'}</label>
   <button className="button primary" disabled={disabled||!reviewed} onClick={()=>void execute({type:'catalogServer',id:selected.id,reviewed:true})}>{simulation?'Simulate adding server':'Add server'}</button>
   <p className="extensions-help">{selected.recipe.transport==='http'&&selected.recipe.oauth?'Use Sign in from Installed after adding. Authentication does not prove tool readiness.':'Check provider requirements before using this server.'}</p>
  </>:selected.package&&selected.compatibility!=='setup-required'?<button className="button primary" disabled={disabled} onClick={()=>void execute({type:'prepareCatalog',id:selected.id})}>{simulation?'Simulate package review':'Download and review'}</button>:selected.hook?<button className="button primary" disabled={disabled} onClick={()=>onHook(selected)}>Add to project draft</button>:<button className="button" onClick={()=>void external(selected.homepage)}>Open setup instructions<ArrowUpRight size={14}/></button>}</div>
 </section></>;

 function renderEntries(items:DirectoryEntry[]){return <div className={`catalog-grid${source==='community'?' catalog-list':''}`}>{items.map(item=><ExtensionRow key={item.id} id={item.id} title={item.title} summary={summaryFor(item)} icon={item.icon} kind={item.kind} setup={item.compatibility==='setup-required'} status={configuredServer(item)?'Configured':item.compatibility==='setup-required'?'Setup required':undefined} onClick={()=>viewItem(item)}/>)}</div>;}

 return <section className="extension-catalog" aria-label="Extension directory" ref={directoryRoot}>
  {!activeSection&&!submittedQuery&&source==='recommended'&&<h4 className="catalog-sr-only" ref={sectionHeading} tabIndex={-1}>All categories</h4>}
  <CatalogToolbar kind={kind} view={source} onView={value=>value==='installed'?onInstalled():chooseSource(value)} query={query} onQuery={setQuery} onSearch={()=>void search()} onRefresh={()=>void search(source,undefined,true)} refreshing={busy}>
   {source==='recommended'&&<select className="catalog-category" aria-label="Category" value={section??''} onChange={e=>showSection(e.target.value||undefined)}><option value="">All categories</option>{sections.map(group=><option key={group.title}>{group.title}</option>)}</select>}
  </CatalogToolbar>
  {source==='community'&&<details className="catalog-source-info"><summary>About community listings</summary><p>{page?.disclosure??'Public registries and GitHub catalogs. Listings require compatibility review.'}</p></details>}
  {page&&(page.stale||page.offline)&&<p className="extensions-alert">{page.offline?'Offline · showing saved results.':'Cached results may be out of date.'} {page.fetchedAt&&`Last fetched ${new Date(page.fetchedAt).toLocaleString()}`}</p>}
  {error&&<p role="alert" className="extensions-alert error">{error}</p>}
  {page?.errors.map((message,index)=><p className="extensions-alert" key={index}>{message}</p>)}
  {activeSection?<section className="catalog-section"><button className="text-link catalog-back" onClick={()=>showSection()}><ChevronLeft size={15}/>Back to all categories</button><div className="catalog-section-heading"><h4 ref={sectionHeading} tabIndex={-1}>{activeSection.title}</h4><span className="catalog-section-count">{activeSection.items.length}</span>{activeSection.title==='Popular'&&<span className="catalog-curated-label">Curated</span>}</div>{renderEntries(activeSection.items)}</section>:source==='community'||submittedQuery?<section className="catalog-section"><div className="catalog-section-heading"><h4 ref={sectionHeading} tabIndex={-1}>{submittedQuery?'Search results':'Community results'}</h4><span className="catalog-section-count">{entries.length}</span>{submittedQuery&&<button className="text-link catalog-clear-search" onClick={()=>{setQuery('');void search(source,undefined,false,'');}}>Clear search</button>}</div>{renderEntries(entries)}</section>:sections.map(group=><section className="catalog-section" key={group.title}><div className="catalog-section-heading"><button className="catalog-section-link" aria-label={`See all ${group.title}`} onClick={()=>showSection(group.title)}><h4>{group.title}</h4><ChevronRight size={14}/></button>{group.title==='Popular'&&<span className="catalog-curated-label">Curated</span>}</div>{renderEntries(group.items.slice(0,6))}</section>)}
  {busy&&<p className="extensions-loading" role="status"><LoaderCircle size={17} className="spin"/>Loading catalog…</p>}
  {page&&!busy&&!entries.length&&<p className="extensions-empty">No matches in this source. Try another search or source.</p>}
  <div ref={sentinel} className="catalog-sentinel" aria-hidden="true"/>
  {error&&page?.nextCursor&&<button className="button" disabled={busy} onClick={()=>void search(source,page.nextCursor!)}>Retry loading</button>}
 </section>;
}
