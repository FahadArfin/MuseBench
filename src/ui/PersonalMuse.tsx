import {TypedText} from './TypedText';
import {UpdateToolbar} from './AppUpdates';
import {NavigationButtons} from './NavigationHistory';
import {useContext} from 'react';
import {BrowserPreviewContext} from './BrowserPreviewContext';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject, type ReactNode } from 'react';
import { Plus, CalendarDays, Images, Shapes, Clapperboard, ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronRight, ExternalLink, Globe2, Info, Library, Lightbulb, Link2, LoaderCircle, MessageCircle, MessagesSquare, MoreHorizontal, Newspaper, PanelLeft, PanelLeftClose, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, SquarePen, Target, Terminal, UserRound, X, type LucideIcon } from 'lucide-react';
import type { PersonalCommand, PersonalDestination, PersonalLibrary, PersonalLibraryGroup, PersonalServiceAction, PersonalState } from '../shared/types';
import { Modal } from './WorkspacePanels';
import './personal-muse.css';

export type MuseProduct = 'code' | 'personal';
const destinations = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'bot', label: 'Muse AI bot', icon: Bot },
] as const;
const emptyLibrary: PersonalLibrary = {
  chats: { status: 'idle', items: [] },
  ideas: { status: 'idle', items: [] },
  goals: { status: 'idle', items: [] },
  selectedId: null,
};

export function ProductSwitcher({ product, onChange, sidebarToggle }: {product: MuseProduct;onChange: (product: MuseProduct) => void;sidebarToggle?: ReactNode;}) {
  const ProductIcon=product==='code'?Terminal:MessagesSquare;
  return <div className="product-switcher">
    <div key={product} className={`brand-button product-name product-name-${product}`} aria-label={product==='code'?'Muse Code':'Muse AI'}><ProductIcon className="product-brand-icon" size={28} strokeWidth={1.8} aria-hidden="true"/><TypedText text={product==='code'?'Muse Code':'Muse AI'} delay={300} interval={85}/></div>
    {sidebarToggle}
    <div className="product-mode-switch" role="group" aria-label="Choose workspace">
      <button type="button" aria-label="Muse Code" aria-pressed={product==='code'} title="Muse Code" onClick={()=>onChange('code')}><Terminal size={18} strokeWidth={1.8} aria-hidden="true"/></button>
      <button type="button" aria-label="Muse AI" aria-pressed={product==='personal'} title="Muse AI · Chat, ideas, goals and Work" onClick={()=>onChange('personal')}><MessagesSquare size={18} strokeWidth={1.8} aria-hidden="true"/></button>
    </div>
  </div>;
}

function PersonalCollection({ label, noun, icon: Icon, group, selectedId, active, query, available, onNavigate, onSelect, onCreate, onMain, mainActive }: {
  label: string;
  noun: string;
  icon: LucideIcon;
  group: PersonalLibraryGroup;
  selectedId: string | null;
  active: boolean;
  query: string;
  available: boolean;
  onNavigate: () => void;
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onMain?: () => void;
  mainActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(label === 'Chat');
  const [limit, setLimit] = useState(6);
  const listId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const items = group.items.filter(item => item.title.toLocaleLowerCase().includes(normalizedQuery));
  const loading = group.status === 'loading' || group.status === 'idle';
  const shown = items.slice(0, limit);
  // Keep search results discoverable even if a collection was collapsed.
  const open = expanded || Boolean(normalizedQuery);
  useEffect(() => setLimit(6), [normalizedQuery]);
  useEffect(() => { if (selectedId && group.items.some(item => item.id === selectedId)) setExpanded(true); }, [selectedId]);
  return <section className="personal-collection" role="group" aria-label={label}>
    <div className={`personal-collection-heading ${active && !selectedId ? 'active' : ''}`}>
      <button type="button" className="personal-collection-collapse" aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={open} aria-controls={listId} disabled={Boolean(normalizedQuery)} title={normalizedQuery ? 'Collections stay open while filtering' : `${open ? 'Collapse' : 'Expand'} ${label}`} onClick={() => setExpanded(!expanded)}><ChevronRight size={13} className={open ? 'rotated' : ''} /></button>
      <button type="button" className="personal-collection-title" aria-label={label} aria-current={active && !selectedId ? 'page' : undefined} disabled={!available} aria-expanded={open} aria-controls={listId} onClick={() => { if (!normalizedQuery) setExpanded(!open); if (!open && !onMain) onNavigate(); }}><Icon size={15} /><span>{label}</span></button>
      {onCreate && <button type="button" className="icon-button personal-collection-add" aria-label="Create a side chat" title="Create a side chat" disabled={!available} onClick={()=>{setExpanded(true);onCreate();}}><Plus size={15}/></button>}
      {!onCreate && (loading ? <LoaderCircle size={12} className="spin personal-collection-loading" aria-label={`Loading ${label}`} /> : <span className="personal-collection-count" title={`${group.items.length} loaded ${noun}`}>{normalizedQuery ? `${items.length}/${group.items.length}` : group.items.length}</span>)}
    </div>
    <div id={listId} className="personal-collection-list" hidden={!open}>
      {onMain && <button type="button" className={`personal-item-row ${mainActive ? 'selected' : ''}`} aria-current={mainActive ? 'page' : undefined} onClick={onMain}>Main conversation</button>}
      {shown.map(item => <button type="button" key={item.id} className={`personal-item-row ${item.id === selectedId ? 'selected' : ''}`} aria-label={item.title} aria-current={item.id === selectedId ? 'page' : undefined} title={item.title} onClick={() => onSelect(item.id)}><span>{item.title}</span></button>)}
      {!shown.length && <p className="personal-collection-empty" role="status">{loading ? `Loading ${noun}…` : group.status === 'unavailable' ? `Open Muse, then refresh to load your ${noun}.` : normalizedQuery ? 'No matching titles.' : `No ${noun} to show yet.`}</p>}
      {!!shown.length && group.status === 'unavailable' && <p className="personal-collection-empty" role="status">Couldn’t refresh. Showing loaded titles.</p>}
      {items.length > limit && <button type="button" className="personal-show-more" aria-label={`Show more ${label}`} onClick={() => setLimit(value => value + 6)}>Show more<span>{items.length - shown.length}</span><ChevronDown size={12} /></button>}
      {limit > 6 && items.length > 6 && <button type="button" className="personal-show-more" aria-label={`Show fewer ${label}`} onClick={() => setLimit(6)}>Show fewer</button>}
    </div>
  </section>;
}

function ScheduledTasks({schedules,onCommand}:{schedules:NonNullable<PersonalState['schedules']>;onCommand:(command:PersonalCommand)=>void}){
 const [limit,setLimit]=useState(5);
 return <section className="scheduled-sidebar" aria-label="Scheduled tasks">
  <button type="button" className="navigation-row" onClick={()=>onCommand({type:'scheduleAction',action:'new'})}><SquarePen size={15}/><span>New task</span></button>
  <h3>Upcoming <span>{schedules.items.length||''}</span></h3>
  {schedules.items.slice(0,limit).map(item=><div key={item.id} className="scheduled-task">
   <button type="button" className="scheduled-task-title" disabled={item.ambiguous} title={item.ambiguous?'Open this reminder in the main Scheduled page':`Edit ${item.title}`} aria-label={`Edit scheduled task: ${item.title}`} onClick={()=>onCommand({type:'scheduleAction',action:'edit',id:item.id})}><span>{item.title}</span><small>{item.timing||'Scheduled'}</small></button>
   <button type="button" className="icon-button" disabled={item.ambiguous} aria-label={`Options for ${item.title}`} title="View chat or delete task" onClick={()=>onCommand({type:'scheduleAction',action:'options',id:item.id})}><MoreHorizontal size={15}/></button>
  </div>)}
  {!schedules.items.length&&<p role="status">{schedules.status==='ready'?'No upcoming tasks.':schedules.status==='loading'?'Loading tasks…':'Couldn’t load tasks. Try reloading Scheduled.'}</p>}
  {schedules.items.length>limit&&<button type="button" className="personal-show-more" onClick={()=>setLimit(value=>value+5)}>Show more</button>}
 </section>;
}

export function PersonalNavigation({ schedules, agentProfile, destination, onNavigate, onAction, onCommand, available, library = emptyLibrary, filterRef, searchOpen, onSearchOpenChange }: {
  schedules?:PersonalState['schedules'];
  agentProfile?: PersonalState['agentProfile'];
  destination: PersonalDestination;
  onNavigate: (destination: PersonalDestination) => void;
  onAction: (action: PersonalServiceAction) => void;
  onCommand: (command: PersonalCommand) => void;
  available: PersonalState['available'];
  library?: PersonalLibrary;
  filterRef?: RefObject<HTMLInputElement | null>;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const filterId = useId();
  const localFilter = useRef<HTMLInputElement>(null);
  const input = filterRef ?? localFilter;
  const refreshing = [library.chats, library.ideas, library.goals].some(group => group.status === 'loading');
  useEffect(() => { if (searchOpen) input.current?.focus(); else setQuery(''); }, [searchOpen]);
  const [expandedService, setExpandedService] = useState<'muse'|'meta'|null>(null);
  const museOpen = expandedService === 'muse';
  const metaOpen = expandedService === 'meta';
  const openService = (service:'muse'|'meta') => {
    const collapse = expandedService === service;
    setExpandedService(collapse ? null : service);
    onSearchOpenChange(false);
    if (!collapse) onNavigate(service==='muse'?'bot':'chat');
  };
  const mainChat = library.chats.items.find(item=>item.main);
  const mainActive = destination==='bot' && Boolean(mainChat && library.selectedId===mainChat.id);
  const openMain = () => {
    setExpandedService('muse');
    onSearchOpenChange(false);
    if (mainChat) onCommand({type:'selectItem',id:mainChat.id});
    else onNavigate('bot');
  };
  const museSectionId = useId(), metaSectionId = useId();
  const agentName=agentProfile?.name?.trim()||'Muse';
  const agentButton=<button type="button" className={`navigation-row personal-service-heading muse-agent-shortcut ${museOpen?'active':''}`} aria-label={agentName} title={agentName} aria-expanded={museOpen} aria-controls={museSectionId} aria-current={destination==='bot'&&!library.selectedId?'page':undefined} disabled={!available.bot} onClick={openMain}>
    {agentProfile?.avatar?<img className="muse-agent-avatar" src={agentProfile.avatar} alt="" draggable={false}/>:<Bot size={20} aria-hidden="true"/>}<span className="personal-service-label"><strong>{agentName}</strong><small>Personal assistant</small></span>
  </button>;
  return <div className="personal-navigation">
    <div className="personal-navigation-scroll">
      <div className="personal-sidebar-controls">{agentButton}<button type="button" className="icon-button muse-service-collapse" aria-label={museOpen?'Collapse Muse':'Expand Muse'} aria-expanded={museOpen} aria-controls={museSectionId} onClick={()=>setExpandedService(museOpen?null:'muse')}><ChevronRight size={15} className={museOpen?'rotated':''}/></button></div>
      <div id={museSectionId} className={`personal-service-content ${museOpen?'expanded':''}`} aria-hidden={!museOpen} inert={!museOpen}><div className="personal-service-inner">
      <div className="personal-filter-row" hidden={!searchOpen || destination==='chat'}>
        <div className="personal-filter"><Search size={14} aria-hidden="true" /><input ref={input} aria-label="Filter Muse sidebar" aria-describedby={filterId} placeholder="Search your Muse" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); } }} />{query && <button type="button" aria-label="Clear Muse filter" onClick={() => { setQuery(''); input.current?.focus(); }}><X size={12} /></button>}</div>
        <button type="button" className="icon-button personal-refresh" aria-label="Refresh Muse sidebar" title="Refresh Muse chats, ideas, and goals" disabled={refreshing || !available.bot} onClick={() => onCommand({ type: 'refreshLibrary' })}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button>
      </div>
      <p className="sr-only" id={filterId}>Filters the loaded chat, idea, and goal titles in this sidebar.</p>
      <nav aria-label="Muse collections">
        <PersonalCollection label="Chat" noun="side chats" icon={MessageCircle} group={{...library.chats,items:library.chats.items.filter(item=>!item.main)}} selectedId={library.selectedId} active={destination==='bot'} query={query} available={available.bot} onMain={openMain} mainActive={mainActive} onNavigate={()=>onNavigate('bot')} onSelect={id=>onCommand({type:'selectItem',id})} onCreate={()=>onCommand({type:'newMuseChat'})}/>
        <PersonalCollection label="Ideas" noun="ideas" icon={Lightbulb} group={library.ideas} selectedId={library.selectedId} active={destination === 'ideas'} query={query} available={available.ideas} onNavigate={() => onNavigate('ideas')} onSelect={id => onCommand({ type: 'selectItem', id })} />
        <PersonalCollection label="Goals" noun="goals" icon={Target} group={library.goals} selectedId={library.selectedId} active={destination === 'goals'} query={query} available={available.goals} onNavigate={() => onNavigate('goals')} onSelect={id => onCommand({ type: 'selectItem', id })} />
      </nav>
      <div className="personal-tools"><nav aria-label="Muse tools">
        <button className="navigation-row" type="button" aria-label="Search Muse" onClick={() => onAction('search')}><Search size={15} /><span>Search Muse</span><ExternalLink size={11} /></button>
        <button className="navigation-row" type="button" aria-label="Muse feed" onClick={() => onAction('feed')}><Newspaper size={15} /><span>Feed</span></button>
        <button className="navigation-row" type="button" aria-label="Muse library" onClick={() => onAction('library')}><Library size={15} /><span>Library</span></button>
      </nav></div>
      </div></div>
      <nav className="meta-native-navigation" aria-label="Meta AI navigation">
        <button type="button" className={`navigation-row personal-service-heading personal-meta-chat ${metaOpen?'active':''}`} aria-current={destination==='chat'?'page':undefined} aria-label="Chat" aria-expanded={metaOpen} aria-controls={metaSectionId} disabled={!available.chat} title="Regular Meta AI chat" onClick={() => openService('meta')}><MessageCircle size={20} /><span className="personal-service-label"><strong>Meta AI Chat</strong><small>Chat &amp; create</small></span><ChevronRight className="personal-service-chevron" size={15} aria-hidden="true"/></button>
        <div id={metaSectionId} className={`personal-service-content ${metaOpen?'expanded':''}`} aria-hidden={!metaOpen} inert={!metaOpen}><div className="personal-service-inner">
    {([{action:'newChat',label:'New chat',icon:SquarePen},{action:'search',label:'Search',icon:Search},{action:'media',label:'Media',icon:Images},{action:'artifacts',label:'Artifacts',icon:Shapes},{action:'scheduled',label:'Scheduled',icon:CalendarDays},{action:'vibes',label:'Vibes',icon:Clapperboard}] as const).map(item=><button key={item.action} type="button" aria-label={item.label} aria-current={item.action==='scheduled'&&schedules?'page':undefined} className={`navigation-row ${item.action==='scheduled'&&schedules?'active':''}`} disabled={!available.chat} onClick={()=>onCommand({type:'metaAction',action:item.action})}><item.icon size={17}/><span>{item.label}</span>{destination==='chat'&&item.action==='search'&&<kbd>Ctrl K</kbd>}{destination==='chat'&&item.action==='newChat'&&<kbd>Ctrl N</kbd>}</button>)}
    {destination==='chat'&&schedules&&<ScheduledTasks schedules={schedules} onCommand={onCommand}/>}
        </div></div>
      </nav>
    </div>
  </div>;
}

export function usePersonalBrowser(): { state: PersonalState | null; command: (command: PersonalCommand) => Promise<void> } {
  const bridge = window.musebench;
  const [state, setState] = useState<PersonalState | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!bridge?.personalState || !bridge.onPersonalState) return () => { alive.current = false; };
    let receivedEvent = false;
    const dispose = bridge.onPersonalState(next => { receivedEvent = true; if (alive.current) setState(next); });
    bridge.personalState().then(next => { if (alive.current && !receivedEvent) setState(next); }).catch(() => {
      if (alive.current) setState(current => ({ ...(current ?? { destination: 'chat', loading: false, origin: '', canGoBack: false, canGoForward: false, visible: false, compact: true, notice: null, authenticating: false, authWindowOpen: false, available: { bot: true, chat: true, ideas: true, goals: true }, library: emptyLibrary }), error: 'Meta AI could not connect to its browser. Try reopening the app.' }));
    });
    return () => { alive.current = false; dispose(); };
  }, [bridge]);
  const command = useCallback(async (request: PersonalCommand) => {
    if (!bridge?.personal) return;
    try { await bridge.personal(request); }
    catch {
      if (alive.current && request.type !== 'layout') setState(current => current ? { ...current, error: 'The assistant could not complete that action. Try reloading the page.' } : null);
    }
  }, [bridge]);
  return { state, command };
}

export function PersonalWorkspace({ active, obscured, destination, state, command, onNavigationOpen, onSettings, collapsed, onToggleSidebar, modeSwitch }: {
  modeSwitch?:ReactNode;
  active: boolean;
  obscured: boolean;
  destination: PersonalDestination;
  state: PersonalState | null;
  command: (command: PersonalCommand) => Promise<void>;
  onNavigationOpen: () => void;
  onSettings: () => void;
  collapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const browserPreview=useContext(BrowserPreviewContext);
  const slot = useRef<HTMLDivElement>(null);
  const lastLayout = useRef('');
  const initialNavigation = useRef(false);
  const [overlay, setOverlay] = useState<'more' | 'accounts' | null>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const moreMenu = useRef<HTMLDivElement>(null);
  const moreId = useId();
  const ready = Boolean(window.musebench?.personal);
  const selectedItem = state?.library && [state.library.chats, state.library.ideas, state.library.goals].flatMap(group => group.items).find(item => item.id === state.library.selectedId);
  const label = selectedItem?.title ?? (destination === 'bot' ? state?.agentProfile?.name||'Muse' : destination === 'chat' ? 'Meta AI Chat' : destinations.find(item => item.id === destination)?.label ?? 'Meta AI');
  const error = state?.error;
  const covered = obscured || overlay !== null;
  const compact = state?.compact !== false;
  const signingIn = Boolean(state?.authenticating || state?.authWindowOpen);
  const perform = (request: PersonalCommand) => { void command(request); setOverlay(null); if (overlay === 'more') moreTrigger.current?.focus(); };
  useEffect(() => { if (!active || obscured) setOverlay(null); }, [active, obscured]);
  useEffect(() => {
    if (!overlay) return;
    const closeForShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['k', 'n'].includes(event.key.toLowerCase())) setOverlay(null);
    };
    window.addEventListener('keydown', closeForShortcut);
    return () => window.removeEventListener('keydown', closeForShortcut);
  }, [overlay]);
  useEffect(() => {
    if (overlay !== 'more') return;
    const outside = (event: PointerEvent) => {
      if (!moreMenu.current?.contains(event.target as Node) && !moreTrigger.current?.contains(event.target as Node)) setOverlay(null);
    };
    document.addEventListener('pointerdown', outside);
    const frame = requestAnimationFrame(() => moreMenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    return () => { document.removeEventListener('pointerdown', outside); cancelAnimationFrame(frame); };
  }, [overlay]);
  const menuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOverlay(null); moreTrigger.current?.focus(); return; }
    if (event.key === 'Tab') { setOverlay(null); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(moreMenu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  useEffect(() => {
    if (!active || !ready || !state || initialNavigation.current) return;
    initialNavigation.current = true;
    void command({ type: 'navigate', destination });
  }, [active, ready, state, destination, command]);
  useLayoutEffect(() => {
    let frame = 0;
    const sendLayout = () => {
      frame = 0;
      const rect = slot.current?.getBoundingClientRect();
      const visible = Boolean(active && !covered && !error && rect && rect.width > 0 && rect.height > 0);
      const bounds = rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : { x: 0, y: 0, width: 0, height: 0 };
      const next: PersonalCommand = { type: 'layout', visible, bounds };
      const signature = JSON.stringify(next);
      if (signature !== lastLayout.current) { lastLayout.current = signature; void command(next); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sendLayout); };
    sendLayout();
    const observer = new ResizeObserver(schedule);
    if (slot.current) observer.observe(slot.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      lastLayout.current = '';
      void command({ type: 'layout', visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } });
    };
  }, [active, covered, error, command]);
  return <section className="workspace personal-workspace" hidden={!active} inert={!active ? true : undefined} aria-label="Meta AI workspace">
    <header className="topbar personal-topbar">
      <div className="personal-header-context">
      <button type="button" className="icon-button mobile-toggle" aria-label="Open navigation" onClick={onNavigationOpen}><PanelLeft size={17} /></button>
      {collapsed && <button type="button" className="icon-button collapsed-toggle" aria-label="Show sidebar" onClick={onToggleSidebar}><PanelLeft size={17} /></button>}
      <NavigationButtons/><div className="breadcrumbs"><strong>{label}</strong>{state?.loading && <LoaderCircle size={13} className="spin personal-header-loading" aria-label="Loading page" />}</div>
      </div>
      <div className="topbar-actions"><UpdateToolbar/>
        {signingIn ? <span className="personal-auth-status" role="status"><ShieldCheck size={14} /><span>{state?.authWindowOpen ? 'Finish sign-in in the opened window' : 'Signing in with Meta'}</span></span> : <>
          {<button type="button" className={`icon-button personal-presentation-toggle ${compact ? 'selected' : ''}`} aria-label={destination==='chat'?'Use integrated Meta AI layout':'Use integrated Muse layout'} aria-pressed={compact} title={compact ? 'Show original website navigation' : 'Use integrated navigation'} disabled={!ready} onClick={() => void command({ type: 'presentation', compact: !compact })}>{compact ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}</button>}
          <button type="button" className="personal-accounts-trigger" aria-label="Accounts and connections" title="Accounts and connections" aria-haspopup="dialog" disabled={!ready} onClick={() => setOverlay(overlay === 'accounts' ? null : 'accounts')}><UserRound size={15} /><span>Accounts</span></button>
        </>}
        <div className="personal-more">
          <button ref={moreTrigger} type="button" className="icon-button" aria-label="More Meta AI options" title="More options" aria-haspopup="menu" aria-expanded={overlay === 'more'} aria-controls={moreId} onClick={() => setOverlay(overlay === 'more' ? null : 'more')} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOverlay('more'); } }}><MoreHorizontal size={19} /></button>
          {overlay === 'more' && <div id={moreId} ref={moreMenu} className="personal-more-menu" role="menu" aria-label="Meta AI options" onKeyDown={menuKeyDown}>
            <button type="button" role="menuitem" aria-label="Go back in Meta AI" disabled={!state?.canGoBack} onClick={() => perform({ type: 'back' })}><ArrowLeft size={15} /><span>Back</span></button>
            <button type="button" role="menuitem" aria-label="Go forward in Meta AI" disabled={!state?.canGoForward} onClick={() => perform({ type: 'forward' })}><ArrowRight size={15} /><span>Forward</span></button>
            <button type="button" role="menuitem" aria-label="Reload Meta AI page" disabled={!ready} onClick={() => perform({ type: 'reload' })}><RefreshCw size={15} /><span>Reload</span></button>
            <button type="button" role="menuitem" aria-label="Open Meta AI in browser" disabled={!ready} onClick={() => perform({ type: 'openExternal' })}><ExternalLink size={15} /><span>Open in browser</span></button>
            <div className="personal-menu-divider" role="separator" />
            <button type="button" role="menuitem" aria-label="Settings" onClick={() => { setOverlay(null); onSettings(); }}><Settings2 size={15} /><span>MuseBench settings</span></button>
            <div className="personal-service-origin"><Globe2 size={12} /><span>{state?.origin || 'Official Meta service'}</span></div>
          </div>}
        </div>
      </div>
    </header>
    {modeSwitch && <div className="workspace-mode-row">{modeSwitch}</div>}
    {state?.notice && <div className="personal-notice" role="status"><Info size={14} /><p>{state.notice}</p><button type="button" className="icon-button" aria-label="Dismiss Meta AI notice" onClick={() => void command({ type: 'dismissNotice' })}><X size={14} /></button></div>}
    <div className="personal-browser-slot" ref={slot} data-testid="personal-browser-slot">
      {browserPreview.personal?.(state)}
      {!ready ? <div className="personal-browser-message"><Bot size={28} /><h1>Open Meta AI in MuseBench</h1><p>The personal assistant is available in the desktop app.</p></div>
        : error ? <div className="personal-browser-message" role="alert"><Globe2 size={28} /><h1>Unable to open {label}</h1><p>{error}</p><div><button type="button" className="button" onClick={() => void command({ type: 'reload' })}><RefreshCw size={14} />Try again</button><button type="button" className="button" onClick={() => void command({ type: 'openExternal' })}><ExternalLink size={14} />Open in browser</button></div></div>
          : !state?.visible && !covered ? <div className="personal-browser-message" role="status"><LoaderCircle size={24} className="spin" /><p>{state?.loading ? `Opening ${label}…` : `Connecting to ${label}…`}</p></div> : null}
    </div>
    {overlay === 'accounts' && <Modal title="Accounts and connections" className="personal-accounts-modal" close={() => setOverlay(null)}>
      <p className="personal-accounts-intro">Manage your accounts on Meta’s official pages. MuseBench remembers each sign-in on this computer.</p>
      <div className="personal-account-group" aria-label="Your accounts">
        <button type="button" className="personal-account-row" aria-label="Meta AI account" onClick={() => perform({ type: 'navigate', destination: 'chat' })}><span className="personal-account-icon"><MessageCircle size={19} /></span><span><strong>Meta AI account</strong><small>Continue with Facebook or the options Meta provides</small></span><ChevronRight size={15} /></button>
        <button type="button" className="personal-account-row" aria-label="Muse account" onClick={() => perform({ type: 'serviceAction', action: 'settings' })}><span className="personal-account-icon"><Bot size={19} /></span><span><strong>Muse account</strong><small>Profile, preferences, and account settings</small></span><ChevronRight size={15} /></button>
      </div>
      <h3 className="personal-account-section-title">Bring Muse with you</h3>
      <div className="personal-account-group" aria-label="Muse connections">
        <button type="button" className="personal-account-row" aria-label="Connect WhatsApp" onClick={() => perform({ type: 'serviceAction', action: 'whatsapp' })}><span className="personal-account-icon"><Smartphone size={19} /></span><span><strong>Connect WhatsApp</strong><small>Pair through Muse’s official messaging settings</small></span><ChevronRight size={15} /></button>
        <button type="button" className="personal-account-row" aria-label="Connected apps" onClick={() => perform({ type: 'serviceAction', action: 'connections' })}><span className="personal-account-icon"><Link2 size={19} /></span><span><strong>Connected apps</strong><small>Review and manage what Muse can access</small></span><ChevronRight size={15} /></button>
      </div>
      <p className="personal-account-footnote"><ShieldCheck size={14} /><span>Meta AI and Muse share your browser sign-in. Each service may still ask you to confirm access. Muse CLI sign-in is separate; account permissions and WhatsApp pairing stay with Meta.</span></p>
    </Modal>}
  </section>;
}
