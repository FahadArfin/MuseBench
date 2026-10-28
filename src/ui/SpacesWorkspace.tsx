import {useSurfaceMotion} from './useSurfaceMotion';
import {MotionDisclosure} from './MotionDisclosure';
import {UpdateToolbar} from './AppUpdates';
import {NavigationButtons} from './NavigationHistory';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, Clock3, Copy, FileText, FolderOpen, Globe2, History, LayoutDashboard, Link2, LoaderCircle, LockKeyhole, MessageSquare, Monitor, PanelLeft, Plus, RefreshCw, Search, Send, ShieldCheck, SquarePen, Upload, Users, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SpacePage, SpaceRole, SpacesCommand, SpacesState } from '../shared/spaces-types';
import type { WorkItem, WorkTeam } from '../shared/work-types';
import { WORK_KINDS, WORK_TEAMS } from '../shared/work-catalog.mjs';
import { resolveTheme, type Preferences } from './preferences.mjs';
import './spaces.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error || 'The request could not be completed.');
const emptyState = (error: string): SpacesState => ({ spaces: [], activeId: null, snapshot: null, page: null, comments: [], history: [], error, conflict: false, busy: false, lastSynced: null, invitation: null, hosting: null });
const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const timeLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const roleLabel = (role: SpaceRole) => role.charAt(0).toUpperCase() + role.slice(1);
const hostLabel = (value: string) => { try { return new URL(value).host; } catch { return 'Shared server'; } };
const localOrigin = (value: string) => { try { return ['127.0.0.1', '[::1]', 'localhost'].includes(new URL(value).hostname); } catch { return false; } };
function navigateTabs(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !tabs.length) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus(); tabs[next].click();
}

/** Serialize user commands and skip polls while an operation is already in flight. */
export function useSpaces(active: boolean): { state: SpacesState | null; command: (value: SpacesCommand) => Promise<void> } {
  const bridge = window.musebench;
  const [state, setState] = useState<SpacesState | null>(null);
  const alive = useRef(true);
  const eventVersion = useRef(0);
  const inFlight = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(state);
  latest.current = state;
  const report = useCallback((error: unknown) => {
    if (alive.current) setState(current => ({ ...(current ?? emptyState(errorText(error))), error: errorText(error) }));
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!bridge?.spacesState || !bridge.onSpacesState) {
      report('Spaces needs the MuseBench desktop connection. Reopen MuseBench to reconnect.');
      return () => { alive.current = false; };
    }
    const version = eventVersion.current;
    const dispose = bridge.onSpacesState(next => { eventVersion.current++; if (alive.current) setState(next); });
    void bridge.spacesState().then(next => { if (alive.current && eventVersion.current === version) setState(next); }).catch(report);
    return () => { alive.current = false; dispose(); };
  }, [bridge, report]);
  const command = useCallback((request: SpacesCommand) => {
    inFlight.current++;
    const task = queue.current.then(async () => {
      try {
        if (!bridge?.spaces) throw new Error('The Spaces connection is unavailable. Reopen MuseBench to reconnect.');
        const version = eventVersion.current;
        const next = await bridge.spaces(request);
        if (alive.current && eventVersion.current === version) setState(next);
        if (next.error && request.type !== 'clearInvitation') throw new Error(next.error);
      } catch (error) { report(error); throw error; }
      finally { inFlight.current--; }
    });
    queue.current = task.catch(() => {});
    return task;
  }, [bridge, report]);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (!inFlight.current && latest.current?.activeId && !latest.current.busy) void command({ type: 'refresh' }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [active, command]);
  return { state, command };
}

export function SpacesSidebar({ state, onSelect, onHome, selected }: { state: SpacesState | null; onSelect: (id: string) => void | Promise<void>; onHome: () => void; selected: boolean }) {
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const listId=useId();
  const select = async (id: string) => {
    setError(''); setSelecting(true);
    try { await onSelect(id); } catch (caught) { setError(errorText(caught)); } finally { setSelecting(false); }
  };
  return <section className="spaces-sidebar" aria-label="Shared spaces">
    <button type="button" className={`spaces-sidebar-home ${selected ? 'selected' : ''}`} aria-label="All spaces" aria-expanded={selected} aria-controls={listId} onClick={onHome}><Users size={17} /><span>Spaces</span><small>{state?.spaces.length ?? 0}</small></button>
    <MotionDisclosure id={listId} open={selected}><nav aria-label="Saved spaces">{state?.spaces.map(space => <button key={space.id} type="button" className={`spaces-sidebar-item ${selected && state.activeId === space.id ? 'selected' : ''}`} disabled={selecting || state.busy} title={`${space.name} · ${localOrigin(space.url) ? 'This computer only' : hostLabel(space.url)}`} onClick={() => void select(space.id)}><span className="spaces-mini-icon">{space.name.slice(0, 1).toLocaleUpperCase() || 'S'}</span><span>{space.name}</span>{localOrigin(space.url) ? <Monitor size={12} /> : <Globe2 size={12} />}</button>)}</nav></MotionDisclosure>
    
    {error && <p className="spaces-sidebar-error" role="alert">{error}</p>}
  </section>;
}

interface NoteDraft { title: string; body: string; baseRevision: number | null; initialTitle: string; initialBody: string }
type Drafts = Record<string, NoteDraft>;
const DRAFT_STORAGE_KEY = 'musebench.spaces.noteDrafts.v1';
function readDrafts(): Drafts {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Drafts = {};
    for (const [key, item] of Object.entries(raw)) {
      if (!item || typeof item !== 'object' || key.length > 300 || key === '__proto__') continue;
      const draft = item as NoteDraft;
      if (typeof draft.title === 'string' && draft.title.length <= 160 && typeof draft.body === 'string' && draft.body.length <= 100000 && typeof draft.initialTitle === 'string' && draft.initialTitle.length <= 160 && typeof draft.initialBody === 'string' && draft.initialBody.length <= 100000 && (draft.baseRevision === null || Number.isSafeInteger(draft.baseRevision))) result[key] = draft;
    }
    return result;
  } catch { return {}; }
}
const pageDraft = (page: SpacePage): NoteDraft => ({ title: page.title, body: page.body ?? '', baseRevision: page.revision, initialTitle: page.title, initialBody: page.body ?? '' });
const blankDraft = (): NoteDraft => ({ title: '', body: '', baseRevision: null, initialTitle: '', initialBody: '' });
const dirtyDraft = (draft: NoteDraft) => draft.title !== draft.initialTitle || draft.body !== draft.initialBody;
type PageTab = 'preview' | 'edit' | 'comments' | 'history';
type PublishTarget = { pageId: string; title: string; expectedRevision: number };

function MarkdownPage({ body }: { body: string }) {
  return <div className="spaces-markdown markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a: ({ children, href }) => <span className="message-link" title={href}>{children}</span>,
    img: ({ alt }) => <span className="muted">{alt ? `Image reference: ${alt}` : 'Image reference'}</span>,
  }}>{body}</Markdown></div>;
}

function SpacesDialog({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose); close.current = onClose;
  const pending = useRef(busy); pending.current = busy;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="spaces-dialog-scrim" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div className="spaces-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={root}><div className="spaces-dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label="Close publish dialog" disabled={busy} onClick={onClose}><X size={17} /></button></div>{children}</div></div>;
}

export interface SpacesWorkspaceProps {
  active: boolean; state: SpacesState | null; command: (value: SpacesCommand) => Promise<void>; workItems: WorkItem[];
  onOpenWork: () => void; modeSwitch: ReactNode; onNavigationOpen: () => void; preferences: Preferences;
  home?: boolean; onHomeChange?: (home: boolean) => void; workBusy?: boolean;
}

export function SpacesWorkspace({ active, state, command, workItems, onOpenWork, modeSwitch, onNavigationOpen, preferences, home, onHomeChange, workBusy = false }: SpacesWorkspaceProps) {
  const [localHome, setLocalHome] = useState(true);
  const showHome = home ?? localHome;
  const changeHome = useCallback((value: boolean) => { setLocalHome(value); onHomeChange?.(value); }, [onHomeChange]);
  const [view, setView] = useState<'overview' | 'page' | 'new' | 'members'>('overview');
  const [tab, setTab] = useState<PageTab>('preview');
  const [homeForm, setHomeForm] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [invitation, setInvitation] = useState('');
  const [pending, setPending] = useState('');
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Drafts>(readDrafts);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [discardKey, setDiscardKey] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ pageId: string; revision: number; expectedRevision: number } | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<Exclude<SpaceRole, 'owner'>>('viewer');
  const [copied, setCopied] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTarget, setPublishTarget] = useState<PublishTarget | null>(null);
  const [selectedWork, setSelectedWork] = useState('');
  const [workQuery, setWorkQuery] = useState('');
  const [copyTeam, setCopyTeam] = useState<WorkTeam>('analytics');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewTheme, setPreviewTheme] = useState(() => resolveTheme(preferences.theme, window.matchMedia('(prefers-color-scheme: dark)').matches));
  const previousSpace = useRef(state?.activeId);
  const pendingRef = useRef(false);
  const paneId = useId();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setPreviewTheme(resolveTheme(preferences.theme, media.matches));
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [preferences.theme]);
  useEffect(() => {
    try { window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts)); setDraftStorageError(false); }
    catch { setDraftStorageError(true); }
  }, [drafts]);
  useEffect(() => {
    if (previousSpace.current === state?.activeId) return;
    previousSpace.current = state?.activeId;
    setView('overview'); setQuery(''); setTab('preview'); setLocalError(''); setNotice('');
    setRestore(null); setDiscardKey(null); setRemovingMember(null); setPublishOpen(false); setCopied(false);
    if (state?.activeId) changeHome(false);
  }, [state?.activeId, changeHome]);
  useEffect(() => { setPreviewFailed(false); setRestore(null); setDiscardKey(null); }, [state?.page?.id]);
  useEffect(() => {
    if (state?.snapshot && !state.page && view === 'page') setView('overview');
  }, [state?.snapshot, state?.page, view]);

  const snapshot = state?.snapshot ?? null;
  const connection = state?.spaces.find(space => space.id === state.activeId);
  const localConnection = Boolean(connection && localOrigin(connection.url));
  const page = state?.page ?? null;
  const surface=useRef<HTMLElement>(null);
  useSurfaceMotion(surface,`${showHome}:${state?.activeId}:${view}:${page?.id}:${tab}`,active);
  const role = snapshot?.self.role ?? 'viewer';
  const canEdit = role === 'owner' || role === 'editor';
  const canComment = role !== 'viewer';
  const owner = role === 'owner';
  const blocked = Boolean(pending || state?.busy || !state);
  const pageKey = state?.activeId && page ? `${state.activeId}:${page.id}` : '';
  const draftKey = view === 'new' ? `${state?.activeId ?? ''}:new` : pageKey;
  const draft = drafts[draftKey] ?? (view === 'new' ? blankDraft() : page ? pageDraft(page) : blankDraft());
  const dirty = dirtyDraft(draft);
  const stale = view !== 'new' && page?.type === 'note' && draft.baseRevision !== page.revision;
  const visiblePages = useMemo(() => (snapshot?.pages ?? []).filter(item => `${item.title} ${item.updatedBy}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [snapshot?.pages, query]);
  const visibleWork = useMemo(() => workItems.filter(item => `${item.title} ${item.team} ${item.kind}`.toLocaleLowerCase().includes(workQuery.trim().toLocaleLowerCase())), [workItems, workQuery]);
  const displayedError = localError || state?.error;
  const commentText = commentDrafts[pageKey] ?? '';
  const comments = state?.comments ?? [];

  const safely = async (operation: () => Promise<void>, label = 'action'): Promise<boolean> => {
    if (pendingRef.current) return false;
    pendingRef.current = true; setPending(label); setLocalError(''); setNotice('');
    try { await operation(); return true; }
    catch (error) { setLocalError(errorText(error)); return false; }
    finally { pendingRef.current = false; setPending(''); }
  };
  const selectSpace = async (id: string) => {
    if (await safely(() => command({ type: 'select', id }), 'select')) { changeHome(false); setView('overview'); }
  };
  const openPage = async (id: string) => {
    if (await safely(() => command({ type: 'openPage', pageId: id }), 'openPage')) { setView('page'); setTab('preview'); }
  };
  const createOrJoin = async () => {
    if (blocked || !displayName.trim()) return;
    const request: SpacesCommand = homeForm === 'create' ? { type: 'create', name: name.trim(), description: description.trim(), displayName: displayName.trim() } : { type: 'join', invitation: invitation.trim(), displayName: displayName.trim() };
    if (await safely(() => command(request), homeForm)) { setName(''); setDescription(''); setInvitation(''); changeHome(false); setView('overview'); }
  };
  const editDraft = (patch: Partial<Pick<NoteDraft, 'title' | 'body'>>) => {
    setDrafts(current => ({ ...current, [draftKey]: { ...(current[draftKey] ?? draft), ...patch } }));
  };
  const beginEdit = () => {
    if (page) setDrafts(current => current[pageKey] ? current : { ...current, [pageKey]: pageDraft(page) });
    setTab('edit');
  };
  const saveNote = async (asNew = false) => {
    if (!canEdit || !draft.title.trim() || blocked || (stale && !asNew)) return;
    if (!asNew && view !== 'new' && !dirty) return;
    const savingKey = draftKey;
    const submitted = { ...draft };
    const isNew = view === 'new' || asNew;
    const request: SpacesCommand = { type: 'savePage', title: submitted.title.trim(), body: submitted.body, ...(!isNew && page ? { pageId: page.id, expectedRevision: submitted.baseRevision ?? page.revision } : {}) };
    if (await safely(() => command(request), 'save')) {
      setDrafts(current => {
        const next = { ...current }; const existing = next[savingKey];
        if (!existing || (existing.title === submitted.title && existing.body === submitted.body)) delete next[savingKey];
        else if (!isNew) next[savingKey] = { ...existing, baseRevision: (submitted.baseRevision ?? 0) + 1, initialTitle: submitted.title.trim(), initialBody: submitted.body };
        return next;
      });
      setView('page'); setTab('preview'); setDiscardKey(null);
      setNotice(isNew ? 'Page created in this space.' : 'Page saved. Everyone in this space can read this revision.');
    }
  };
  const reloadDraft = async () => {
    const requestedKey = draftKey;
    if (await safely(async () => { await command({ type: 'clearError' }); await command({ type: 'refresh' }); }, 'reload')) {
      // Deleting is an explicit discard; the next render derives text from the latest authorized page.
      setDrafts(current => { const next = { ...current }; delete next[requestedKey]; return next; });
      setDiscardKey(null); setNotice('Local draft replaced with the latest saved page.');
    }
  };
  const readLatest = async () => {
    if (await safely(async () => { await command({ type: 'clearError' }); await command({ type: 'refresh' }); }, 'refresh')) setTab('preview');
  };
  const startNew = () => { setView('new'); setTab('edit'); setDiscardKey(null); setRestore(null); };
  const openPublisher = (target: PublishTarget | null = null) => { setPublishTarget(target); setSelectedWork(''); setWorkQuery(''); setPublishOpen(true); setLocalError(''); };
  const publish = async () => {
    if (!selectedWork || !canEdit || workBusy) return;
    if (await safely(() => command({ type: 'publishWork', workId: selectedWork, ...(publishTarget ? { pageId: publishTarget.pageId, expectedRevision: publishTarget.expectedRevision } : {}) }), 'publish')) {
      setPublishOpen(false); setView('page'); setTab('preview'); setNotice('Artifact published. Your private Work item is still separate.');
    }
  };
  const copyToWork = async () => {
    if (!page || page.type !== 'artifact' || workBusy) return;
    if (await safely(() => command({ type: 'copyToWork', pageId: page.id, team: copyTeam }), 'copy')) onOpenWork();
  };
  const submitComment = async () => {
    if (!page || !canComment || !commentText.trim() || blocked) return;
    const key = pageKey; const submitted = commentText;
    if (await safely(() => command({ type: 'comment', pageId: page.id, text: submitted.trim() }), 'comment')) setCommentDrafts(current => current[key] === submitted ? { ...current, [key]: '' } : current);
  };
  const copyInvitation = async () => {
    setCopied(false);
    if (await safely(async () => {
      if (!window.musebench?.spacesCopyInvitation) throw new Error('Invitation copying is unavailable. Select the invitation text and copy it manually.');
      await window.musebench.spacesCopyInvitation();
    }, 'clipboard')) setCopied(true);
  };

  if (!active) return null;
  return <section ref={surface} className="workspace spaces-workspace" aria-label="Shared Spaces">
    <header className="topbar spaces-topbar"><button type="button" className="icon-button spaces-navigation-toggle" aria-label="Open navigation" title="Open navigation" onClick={onNavigationOpen}><PanelLeft size={17} /></button><NavigationButtons/><button type="button" className="spaces-breadcrumb-home" onClick={() => changeHome(true)}><Users size={15} /><span>Spaces</span></button>{!showHome && snapshot && <><ChevronRight className="spaces-breadcrumb-separator" size={13} /><span className="spaces-breadcrumb-current">{snapshot.space.name}</span></>}<span className="spaces-topbar-spacer" /><button type="button" className="icon-button" aria-label="Refresh shared space" title="Refresh shared space" disabled={blocked || !state?.activeId} onClick={() => void safely(() => command({ type: 'refresh' }), 'refresh')}><RefreshCw size={15} className={pending === 'refresh' ? 'spin' : ''} /></button><UpdateToolbar/></header>
    {modeSwitch && <div className="workspace-mode-row">{modeSwitch}</div>}
    {displayedError && <div className="spaces-banner error" role="alert"><CircleAlert size={16} /><div><strong>{state?.conflict ? 'This page has a newer revision' : 'The request could not be completed'}</strong><p>{displayedError}</p>{state?.conflict && <p>Your local draft is kept. Read the latest revision, reload the editor explicitly, or save your draft as a new page.</p>}</div><button type="button" className="icon-button" aria-label="Dismiss Spaces error" disabled={Boolean(pending)} onClick={() => { setLocalError(''); void safely(() => command({ type: 'clearError' }), 'dismiss'); }}><X size={15} /></button></div>}
    {notice && <div className="spaces-banner notice" role="status"><Check size={15} /><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {draftStorageError && <div className="spaces-banner" role="status"><CircleAlert size={15} /><span>Your drafts are kept while this screen stays open, but could not be saved for an app reload.</span></div>}

    {showHome || !snapshot ? <div className="spaces-scroll"><div className="spaces-home">
      <div className="spaces-hero"><span className="spaces-eyebrow"><Users size={14} />A place for shared work</span><h1>Keep the work together.</h1><p>Gather pages, publish finished work, and give your team a place to leave feedback.</p><div className="spaces-hero-art" aria-hidden="true"><span className="spaces-art-page back"><i /><i /><i /></span><span className="spaces-art-page front"><FileText size={19} /><i /><i /><i /></span><span className="spaces-art-people"><Users size={18} /></span></div></div>
      <div className="spaces-home-grid"><section className="spaces-home-library" aria-labelledby={`${paneId}-spaces`}><div className="spaces-section-heading"><h2 id={`${paneId}-spaces`}>Your spaces</h2><span>{state?.spaces.length ?? 0}</span></div>{state?.spaces.length ? <div className="spaces-cards">{state.spaces.map(space => <button className="spaces-space-card" type="button" key={space.id} disabled={blocked} onClick={() => void selectSpace(space.id)}><span className="spaces-space-icon"><FolderOpen size={20} /></span><span><strong>{space.name}</strong><small>{localOrigin(space.url) ? <Monitor size={12} /> : <Globe2 size={12} />}{localOrigin(space.url) ? 'This computer' : hostLabel(space.url)}</small></span><ArrowRight size={16} /></button>)}</div> : <div className="spaces-empty"><FolderOpen size={30} /><h3>Your first space starts here</h3><p>Create a space on this computer, or join a hosted space with an invitation.</p></div>}<div className="spaces-privacy-note"><LockKeyhole size={16} /><div><strong>You choose what is shared</strong><p>Publish a saved artifact or write a page. Private Work chats and input files stay private. Published artifact content and source annotations are visible to space members.</p></div></div></section>
        <section className="spaces-setup" aria-label="Create or join a space"><div className="spaces-segmented" aria-label="Space setup"><button type="button" aria-pressed={homeForm === 'create'} className={homeForm === 'create' ? 'selected' : ''} onClick={() => setHomeForm('create')}><Plus size={14} />Create a space</button><button type="button" aria-pressed={homeForm === 'join'} className={homeForm === 'join' ? 'selected' : ''} onClick={() => setHomeForm('join')}><Link2 size={14} />Join a space</button></div><form onSubmit={event => { event.preventDefault(); void createOrJoin(); }}>
          <h2>{homeForm === 'create' ? 'Make room for your next project' : 'Bring your invitation'}</h2><p>{homeForm === 'create' ? 'Start with a name. Add pages and invite collaborators when you are ready.' : 'Paste an invitation or a server owner setup link, then choose your display name.'}</p>
          {homeForm === 'create' ? <><label className="spaces-field"><span>Space name</span><input aria-label="Space name" placeholder="Launch planning" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={pending === 'create'} /></label><label className="spaces-field"><span>Description <small>Optional</small></span><textarea aria-label="Space description" placeholder="What will you work on together?" rows={2} value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} disabled={pending === 'create'} /></label></> : <label className="spaces-field"><span>Invitation</span><textarea aria-label="Space invitation" placeholder="Paste the complete invitation…" rows={3} value={invitation} onChange={event => setInvitation(event.target.value)} maxLength={2200} required spellCheck={false} autoComplete="off" disabled={pending === 'join'} /></label>}
          <label className="spaces-field"><span>Your display name</span><input aria-label="Your display name" placeholder="How members will see you" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={100} required autoComplete="off" disabled={pending === 'create' || pending === 'join'} /><small>Names are self-declared, not verified account identities.</small></label><button className="spaces-button primary spaces-submit" type="submit" disabled={blocked || !displayName.trim() || !(homeForm === 'create' ? name.trim() : invitation.trim())}>{pending === homeForm ? <LoaderCircle size={15} className="spin" /> : homeForm === 'create' ? <Plus size={15} /> : <ArrowRight size={15} />}{homeForm === 'create' ? 'Create local space' : 'Join space'}</button>
        </form><div className="spaces-hosting-note"><Monitor size={15} /><p>{homeForm === 'create' ? 'New spaces run on this computer while MuseBench is open. Local invitations work on this computer only.' : 'A local invitation works on the owner’s computer only. To collaborate across computers, use an invitation from a deployed HTTPS hub.'} <span>No hosted service is set up automatically.</span></p></div></section></div>
    </div></div> : <>
      <div className="spaces-spacebar"><div className="spaces-space-tabs" aria-label="Space views"><button type="button" className={view !== 'members' ? 'selected' : ''} aria-pressed={view !== 'members'} onClick={() => setView('overview')}><FileText size={14} />Pages<span>{snapshot.pages.length}</span></button><button type="button" className={view === 'members' ? 'selected' : ''} aria-pressed={view === 'members'} onClick={() => setView('members')}><Users size={14} />Members<span>{snapshot.members.length}</span></button></div><span className={`spaces-role role-${role}`}><ShieldCheck size={12} />{roleLabel(role)}</span></div>
      {view === 'overview' ? <div className="spaces-scroll"><div className="spaces-overview"><div className="spaces-overview-heading"><div><span className="spaces-eyebrow">Shared space</span><h1>{snapshot.space.name}</h1><p>{snapshot.space.description || 'Pages, published work, and feedback in one place.'}</p></div>{canEdit && <div className="spaces-action-row"><button className="spaces-button" type="button" disabled={blocked || workBusy} onClick={() => openPublisher()}><Upload size={14} />Publish work</button><button className="spaces-button primary" type="button" disabled={blocked || snapshot.pages.length >= 100} onClick={startNew}><Plus size={14} />New page</button></div>}</div>
        <div className={`spaces-connection-card ${localConnection ? 'local' : ''}`}>{localConnection ? <Monitor size={18} /> : <Globe2 size={18} />}<div><strong>{localConnection ? 'Available on this computer' : `Connected to ${hostLabel(connection?.url ?? '')}`}</strong><p>{localConnection ? 'This space runs while MuseBench is open. Invitations from it work on this computer only. Other computers need a deployed HTTPS hub and its invitation.' : 'Members connect to this hosted hub with their own invitations. Access follows the role assigned by the owner.'}</p></div></div>
        <div className="spaces-section-heading"><h2>Pages <small>{snapshot.pages.length} / 100</small></h2><label className="spaces-search"><Search size={14} /><input aria-label="Search space pages" placeholder="Search pages" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear page search" onClick={() => setQuery('')}><X size={13} /></button>}</label></div>
        <div className="spaces-page-list">{visiblePages.map(item => <button className="spaces-page-row" type="button" key={item.id} disabled={blocked} onClick={() => void openPage(item.id)}><span className={`spaces-page-icon ${item.type}`}>{item.type === 'artifact' ? <LayoutDashboard size={18} /> : <FileText size={18} />}</span><span className="spaces-page-row-copy"><strong>{item.title}</strong><small>{item.type === 'artifact' ? 'Published work' : 'Markdown page'}<span>·</span>{item.updatedBy}{drafts[`${state?.activeId}:${item.id}`] && dirtyDraft(drafts[`${state?.activeId}:${item.id}`]) && <b>Local draft</b>}</small></span><span className="spaces-page-date"><span>v{item.revision}</span><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt)}</time></span><ChevronRight size={15} /></button>)}</div>
        {!visiblePages.length && <div className="spaces-empty large"><FileText size={29} /><h3>{query ? 'No pages match your search' : 'Start a shared page'}</h3><p>{query ? 'Try another title or a contributor’s display name.' : canEdit ? 'Write a note or publish an artifact from your private Work library.' : 'Pages published by the owner or an editor will appear here.'}</p>{canEdit && !query && <button type="button" className="spaces-button" onClick={startNew} disabled={blocked}><Plus size={14} />Create a page</button>}</div>}
        <div className="spaces-overview-footer"><span><Users size={14} />{snapshot.members.length} {snapshot.members.length === 1 ? 'member' : 'members'}</span><span><LockKeyhole size={13} />Only explicitly published content is shared</span></div>
      </div></div> : view === 'members' ? <div className="spaces-scroll"><div className="spaces-members"><div className="spaces-overview-heading"><div><span className="spaces-eyebrow">People & access</span><h1>Work together, with clear roles.</h1><p>Every member can read every page in this space. Display names are self-declared.</p></div></div><div className="spaces-members-grid"><section aria-labelledby={`${paneId}-members`}><div className="spaces-section-heading"><h2 id={`${paneId}-members`}>Members <small>{snapshot.members.length} / 100</small></h2></div><div className="spaces-member-list">{snapshot.members.map(member => <div className="spaces-member" key={member.id}><span className="spaces-avatar">{member.name.slice(0, 1).toLocaleUpperCase()}</span><div className="spaces-member-info"><strong>{member.name}{member.id === snapshot.self.id && <small>You</small>}</strong><span>Joined {dateLabel(member.joinedAt)}</span></div><span className={`spaces-role role-${member.role}`}>{roleLabel(member.role)}</span>{owner && member.id !== snapshot.self.id && <button type="button" className="spaces-text-button danger" disabled={blocked} onClick={() => setRemovingMember(member.id)}>Remove</button>}{removingMember === member.id && <div className="spaces-inline-confirm"><p>Remove {member.name}’s future access to this space? Copies they already saved remain with them.</p><div className="spaces-action-row"><button type="button" className="spaces-button" disabled={blocked} onClick={() => setRemovingMember(null)}>Cancel</button><button type="button" className="spaces-button danger" disabled={blocked} onClick={() => void safely(() => command({ type: 'removeMember', memberId: member.id }), 'remove').then(ok => { if (ok) setRemovingMember(null); })}>Remove member</button></div></div>}</div>)}</div><div className="spaces-role-guide"><h3>What each role can do</h3><p><strong>Owner</strong> manages access and edits all pages.</p><p><strong>Editor</strong> publishes, edits, restores, and comments.</p><p><strong>Commenter</strong> reads and leaves feedback.</p><p><strong>Viewer</strong> reads pages, history, and comments.</p></div></section>
          <section className="spaces-invite-panel" aria-labelledby={`${paneId}-invite`}><span className="spaces-invite-icon"><Link2 size={22} /></span><h2 id={`${paneId}-invite`}>{owner ? 'Invite someone in' : 'Invitation management'}</h2><p>{owner ? 'Each invitation can be used once and expires after 48 hours. Share it only with the person you want to invite.' : 'Only the space owner can create invitations, revoke them, or remove members.'}</p>{owner && <><label className="spaces-field"><span>Invite with role</span><select aria-label="Invitation role" value={inviteRole} onChange={event => setInviteRole(event.target.value as Exclude<SpaceRole, 'owner'>)} disabled={blocked}><option value="viewer">Viewer — read only</option><option value="commenter">Commenter — read and comment</option><option value="editor">Editor — edit and publish</option></select></label><button type="button" className="spaces-button primary spaces-submit" disabled={blocked || snapshot.members.length >= 100 || snapshot.invites.length >= 200} onClick={() => { setCopied(false); void safely(() => command({ type: 'invite', role: inviteRole }), 'invite'); }}>{pending === 'invite' ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />}Create invitation</button>{state?.invitation && <div className="spaces-generated-invite"><strong>Your invitation is ready</strong><textarea aria-label="Generated space invitation" readOnly value={state.invitation.text} rows={3} spellCheck={false} onFocus={event => event.target.select()} /><small>Expires {timeLabel(state.invitation.expiresAt)}</small><div className="spaces-action-row"><button className="spaces-button" type="button" disabled={blocked} onClick={() => void copyInvitation()}>{copied ? <CheckCheck size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy invitation'}</button><button className="spaces-text-button" type="button" disabled={blocked} onClick={() => void safely(() => command({ type: 'clearInvitation' }), 'hideInvite')}>Hide</button></div></div>}</>}{localConnection && <div className="spaces-hosting-note"><Monitor size={15} /><p>This invitation works on this computer only. Use a deployed HTTPS hub to invite people on other computers.</p></div>}{owner && <p className="spaces-small-print">This space can keep up to 200 invitation records.</p>}</section></div>
          {owner && snapshot.invites.length > 0 && <section className="spaces-invitations" aria-label="Invitation history"><div className="spaces-section-heading"><h2>Invitations <small>{snapshot.invites.length} / 200</small></h2></div>{snapshot.invites.map(invite => { const expired = new Date(invite.expiresAt).valueOf() <= Date.now(); const status = invite.revoked ? 'Revoked' : invite.used ? 'Used' : expired ? 'Expired' : 'Available'; return <div className="spaces-invitation-row" key={invite.id}><Link2 size={15} /><span><strong>{roleLabel(invite.role)} invitation</strong><small>Expires {timeLabel(invite.expiresAt)}</small></span><span className={status === 'Available' ? 'spaces-invite-status available' : 'spaces-invite-status'}>{status}</span>{status === 'Available' && <button type="button" className="spaces-text-button danger" disabled={blocked} onClick={() => void safely(() => command({ type: 'revokeInvite', inviteId: invite.id }), 'revoke')}>Revoke</button>}</div>; })}</section>}
      </div></div> : <div className="spaces-page-workspace">
        <div className="spaces-page-heading"><button type="button" className="spaces-text-button" onClick={() => setView('overview')}><ArrowLeft size={14} />All pages</button><div><h1>{view === 'new' ? 'New page' : page?.title ?? 'Open a page'}</h1>{view === 'new' ? <p>Write in Markdown. Save when you are ready to share it.</p> : page && <p><span className="spaces-page-version">Revision {page.revision}</span><span>Updated {timeLabel(page.updatedAt)} by {page.updatedBy}</span>{drafts[pageKey] && dirtyDraft(drafts[pageKey]) && <span className="spaces-draft-label">Local draft kept</span>}</p>}</div></div>
        {view === 'new' || page ? <><div className="spaces-page-tabs" role="tablist" aria-label="Page content" onKeyDown={navigateTabs}>{([{ id: 'preview', label: 'Preview', icon: FileText }, ...(canEdit && (view === 'new' || page?.type === 'note') ? [{ id: 'edit', label: 'Edit', icon: SquarePen }] : []), ...(view !== 'new' ? [{ id: 'comments', label: `Comments${comments.length ? ` (${comments.length})` : ''}`, icon: MessageSquare }, { id: 'history', label: 'History', icon: History }] : [])] as { id: PageTab; label: string; icon: typeof FileText }[]).map(item => <button type="button" role="tab" id={`${paneId}-${item.id}-tab`} aria-controls={`${paneId}-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} key={item.id} className={tab === item.id ? 'selected' : ''} onClick={() => item.id === 'edit' ? beginEdit() : setTab(item.id)}><item.icon size={14} />{item.label}</button>)}{page?.type === 'artifact' && view !== 'new' && canEdit && <button type="button" className="spaces-update-artifact" disabled={blocked || workBusy} onClick={() => openPublisher({ pageId: page.id, title: page.title, expectedRevision: page.revision })}><Upload size={14} />Update from Work</button>}</div>
          {(stale || (state?.conflict && tab === 'edit')) && view !== 'new' && page?.type === 'note' && <div className="spaces-conflict" role="status"><CircleAlert size={16} /><div><strong>{stale ? `Your draft is based on revision ${draft.baseRevision}. The latest page is revision ${page.revision}.` : 'The server has a newer revision. Refresh to read the latest saved page.'}</strong><p>The latest saved page is in Preview. Your draft stays in Edit until you explicitly reload it or save a new page.</p><div className="spaces-action-row"><button type="button" className="spaces-text-button" disabled={blocked} onClick={() => void readLatest()}>Read latest page</button><button type="button" className="spaces-text-button" disabled={blocked} onClick={() => setDiscardKey(draftKey)}>Reload editor</button>{canEdit && <button type="button" className="spaces-text-button" disabled={blocked || !draft.title.trim() || snapshot.pages.length >= 100} onClick={() => void saveNote(true)}>Save draft as new page</button>}</div></div></div>}
          {tab === 'preview' && <div id={`${paneId}-preview`} role="tabpanel" aria-labelledby={`${paneId}-preview-tab`} className={`spaces-page-preview ${page?.type === 'artifact' && view !== 'new' ? 'artifact' : ''}`}>{view === 'new' ? <div className="spaces-note-preview"><span className="spaces-draft-preview-note">Private draft preview · not shared yet</span><h1>{draft.title || 'Untitled page'}</h1>{draft.body ? <MarkdownPage body={draft.body} /> : <div className="spaces-empty"><FileText size={25} /><p>Your Markdown preview will appear here.</p><button type="button" className="spaces-button" onClick={() => setTab('edit')}>Write your page</button></div>}</div> : page?.type === 'artifact' ? <><div className="spaces-artifact-copy"><div><LockKeyhole size={14} /><span>Copy to private Work to revise with Muse. Publishing an update is a separate step.</span></div><div className="spaces-action-row"><label><span className="sr-only">Private Work team</span><select aria-label="Private Work team" value={copyTeam} onChange={event => setCopyTeam(event.target.value as WorkTeam)} disabled={blocked || workBusy}>{WORK_TEAMS.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}</select></label><button type="button" className="spaces-button" disabled={blocked || workBusy} title={workBusy ? 'Wait for the running private Work request to finish.' : 'Create a private copy without starting Muse'} onClick={() => void copyToWork()}>{pending === 'copy' ? <LoaderCircle size={14} className="spin" /> : <Copy size={14} />}Copy to Work</button></div></div>{previewFailed ? <div className="spaces-empty large"><CircleAlert size={28} /><h3>The artifact preview could not load</h3><p>Your shared page is still available. Reload the preview or copy it to private Work.</p><button className="spaces-button" type="button" onClick={() => { setPreviewFailed(false); setPreviewAttempt(value => value + 1); }}>Reload preview</button></div> : <iframe key={`${page.id}:${page.revision}:${previewTheme}:${previewAttempt}`} title={`${page.title} shared artifact preview`} sandbox="allow-scripts" referrerPolicy="no-referrer" src={`musebench-artifact://preview/${encodeURIComponent(page.id)}?rev=${encodeURIComponent(page.updatedAt)}&theme=${previewTheme}`} onError={() => setPreviewFailed(true)} />}<div className="spaces-artifact-footer"><span>Published artifact · revision {page.revision}</span><span>{page.artifact?.sources.length ?? 0} source annotations shared</span></div></> : <div className="spaces-note-preview"><h1>{page?.title}</h1>{page?.body ? <MarkdownPage body={page.body} /> : <p className="spaces-empty-note">This page is empty.</p>}</div>}</div>}
          {tab === 'edit' && canEdit && <div id={`${paneId}-edit`} role="tabpanel" aria-labelledby={`${paneId}-edit-tab`} className="spaces-editor"><div className="spaces-editor-status"><span><SquarePen size={13} />Markdown page</span><span>{view === 'new' ? 'Private draft' : dirty ? 'Unsaved changes · kept in this session' : `Based on revision ${draft.baseRevision}`}</span></div><label className="spaces-field spaces-title-field"><span>Page title</span><input aria-label="Page title" placeholder="Give this page a title" maxLength={160} value={draft.title} onChange={event => editDraft({ title: event.target.value })} disabled={pending === 'save'} /></label><textarea className="spaces-markdown-input" aria-label="Page Markdown" placeholder={'# Start with an idea\n\nAdd notes, decisions, links, or a checklist.'} value={draft.body} onChange={event => editDraft({ body: event.target.value })} maxLength={100000} spellCheck={true} disabled={pending === 'save'} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 's' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveNote(); } }} /><div className="spaces-editor-footer"><span>{draft.body.length.toLocaleString()} / 100,000 characters<span>Ctrl / ⌘ S to save</span></span><div className="spaces-action-row">{view !== 'new' && <button type="button" className="spaces-button" disabled={blocked || (!dirty && !stale)} onClick={() => setDiscardKey(draftKey)}>Reload saved page</button>}<button type="button" className="spaces-button primary" disabled={blocked || !draft.title.trim() || stale || (view !== 'new' && !dirty) || (view === 'new' && snapshot.pages.length >= 100)} onClick={() => void saveNote()}>{pending === 'save' ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{view === 'new' ? 'Create page' : 'Save page'}</button></div></div><p className="spaces-editor-sharing"><Users size={12} />Saving makes this content visible to every member of this space.</p></div>}
          {discardKey === draftKey && <div className="spaces-inline-confirm spaces-discard-confirm" role="alert"><p><strong>Replace your local draft with the latest saved page?</strong> Unsaved text in this draft will be discarded. You can keep it by saving as a new page first.</p><div className="spaces-action-row"><button type="button" className="spaces-button" disabled={blocked} onClick={() => setDiscardKey(null)}>Keep my draft</button><button type="button" className="spaces-button danger" disabled={blocked} onClick={() => void reloadDraft()}>Replace local draft</button></div></div>}
          {tab === 'comments' && page && <div id={`${paneId}-comments`} role="tabpanel" aria-labelledby={`${paneId}-comments-tab`} className="spaces-scroll"><div className="spaces-comments"><div className="spaces-section-heading"><div><h2>Conversation</h2><p>{comments.length} / 200 comments · display names are self-declared</p></div><label className="spaces-checkbox"><input type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} />Show resolved</label></div>{comments.filter(comment => showResolved || !comment.resolved).map(comment => <article className={`spaces-comment ${comment.resolved ? 'resolved' : ''}`} key={comment.id}><span className="spaces-avatar">{comment.by.slice(0, 1).toLocaleUpperCase()}</span><div><div className="spaces-comment-heading"><strong>{comment.by}</strong><time dateTime={comment.createdAt}>{timeLabel(comment.createdAt)}</time>{comment.resolved && <span className="spaces-resolved"><CheckCheck size={12} />Resolved</span>}</div><p>{comment.text}</p>{comment.canResolve === true && <button type="button" className="spaces-text-button" disabled={blocked} onClick={() => void safely(() => command({ type: 'resolveComment', pageId: page.id, commentId: comment.id, resolved: !comment.resolved }), 'resolve')}><Check size={12} />{comment.resolved ? 'Reopen' : 'Resolve'}</button>}</div></article>)}{!comments.some(comment => showResolved || !comment.resolved) && <div className="spaces-empty"><MessageSquare size={26} /><h3>{comments.length ? 'All feedback is resolved' : 'Start the conversation'}</h3><p>{canComment ? 'Ask a question or leave feedback for everyone in this space.' : 'Comments from other members will appear here.'}</p></div>}{canComment ? <form className="spaces-comment-form" onSubmit={event => { event.preventDefault(); void submitComment(); }}><label htmlFor={`${paneId}-comment`}>Comment as <strong>{snapshot.self.name}</strong></label><textarea id={`${paneId}-comment`} aria-label="New space comment" placeholder="Leave feedback…" value={commentText} rows={3} maxLength={4000} disabled={pending === 'comment'} onChange={event => setCommentDrafts(current => ({ ...current, [pageKey]: event.target.value }))} /><div><small>{commentText.length.toLocaleString()} / 4,000</small><button type="submit" className="spaces-button primary" disabled={blocked || !commentText.trim() || comments.length >= 200}>{pending === 'comment' ? <LoaderCircle size={13} className="spin" /> : <Send size={13} />}Post comment</button></div></form> : <div className="spaces-permission-note"><ShieldCheck size={16} /><p>You have viewer access. You can read pages, comments, and history. The owner manages who can comment or edit.</p></div>}</div></div>}
          {tab === 'history' && page && <div id={`${paneId}-history`} role="tabpanel" aria-labelledby={`${paneId}-history-tab`} className="spaces-scroll"><div className="spaces-history"><div className="spaces-section-heading"><div><h2>Revision history</h2><p>The latest 30 revisions are kept. Restoring creates a new revision.</p></div><History size={19} /></div>{(state?.history ?? []).slice().sort((a, b) => b.revision - a.revision).map(revision => <div className="spaces-revision" key={revision.revision}><span className="spaces-revision-marker"><Clock3 size={15} /></span><div><strong>{revision.title}</strong><p>Revision {revision.revision} · {revision.by}</p><time dateTime={revision.at}>{timeLabel(revision.at)}</time></div>{revision.revision === page.revision ? <span className="spaces-current-revision">Current</span> : canEdit && <button type="button" className="spaces-button" disabled={blocked} onClick={() => setRestore({ pageId: page.id, revision: revision.revision, expectedRevision: page.revision })}>Restore</button>}</div>)}{!state?.history.length && <div className="spaces-empty"><History size={26} /><p>No revisions are available yet.</p></div>}{restore && restore.pageId === page.id && <div className="spaces-inline-confirm" role="alert"><p>Restore revision {restore.revision} as a new revision? Any local note draft will be kept and may need to be saved as a separate page.</p><div className="spaces-action-row"><button className="spaces-button" type="button" disabled={blocked} onClick={() => setRestore(null)}>Cancel</button><button className="spaces-button primary" type="button" disabled={blocked} onClick={() => void safely(() => command({ type: 'restorePage', ...restore }), 'restore').then(ok => { if (ok) { setRestore(null); setNotice(`Revision ${restore.revision} restored as a new revision.`); } })}><History size={14} />Restore revision {restore.revision}</button></div></div>}</div></div>}
        </> : <div className="spaces-empty large"><FileText size={28} /><h3>Select a page to get started</h3><button className="spaces-button" type="button" onClick={() => setView('overview')}>Browse pages</button></div>}
      </div>}
      <footer className="spaces-status"><span>{localConnection ? <Monitor size={12} /> : <Globe2 size={12} />}{localConnection ? 'This computer only' : hostLabel(connection?.url ?? '')}</span><span>{state?.busy || pending ? <><LoaderCircle size={12} className="spin" />Updating…</> : state?.lastSynced ? `Refreshed ${timeLabel(state.lastSynced)}` : 'Waiting for first refresh'}</span></footer>
    </>}
    {publishOpen && snapshot && <SpacesDialog title={publishTarget ? 'Update this shared artifact' : 'Publish from private Work'} busy={Boolean(pending)} onClose={() => setPublishOpen(false)}><div className="spaces-publish-boundary"><Upload size={17} /><div><strong>{publishTarget ? `Replace “${publishTarget.title}” at revision ${publishTarget.expectedRevision}` : `Publish a new artifact in “${snapshot.space.name}”`}</strong><p>Members receive the saved artifact and its source annotations. Private chats, input file bytes, and browser sessions are not shared. Review your artifact for content you do not want to publish.</p></div></div>{publishTarget && <button className="spaces-text-button" type="button" disabled={blocked} onClick={() => setPublishTarget(null)}>Publish as a new page instead</button>}<label className="spaces-search"><Search size={14} /><input aria-label="Search private Work to publish" placeholder="Search your saved work" value={workQuery} onChange={event => setWorkQuery(event.target.value)} /></label><div className="spaces-publish-list" role="radiogroup" aria-label="Saved work to publish">{visibleWork.map(item => <label className={`spaces-publish-item ${selectedWork === item.id ? 'selected' : ''}`} key={item.id}><input type="radio" name={`${paneId}-work`} value={item.id} checked={selectedWork === item.id} onChange={() => setSelectedWork(item.id)} disabled={blocked} /><LayoutDashboard size={17} /><span><strong>{item.title}</strong><small>{WORK_KINDS.find(kind => kind.id === item.kind)?.label ?? item.kind} · {WORK_TEAMS.find(team => team.id === item.team)?.label ?? item.team}{item.demo ? ' · Sample' : ''}</small></span><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt)}</time></label>)}</div>{!visibleWork.length && <div className="spaces-empty"><FolderOpen size={24} /><p>{workQuery ? 'No saved work matches your search.' : 'Create and save an artifact in Work before publishing it here.'}</p></div>}{localError && <p className="spaces-dialog-error" role="alert">{localError}</p>}{workBusy && <p className="spaces-dialog-error" role="status">Wait for the running private Work request to finish before publishing.</p>}<p className="spaces-small-print">Publishing creates a shared copy. Future edits in private Work are published only when you choose to update this space. No Muse request starts.</p><div className="spaces-dialog-actions"><button className="spaces-button" type="button" disabled={Boolean(pending)} onClick={() => setPublishOpen(false)}>Cancel</button><button className="spaces-button primary" type="button" disabled={blocked || workBusy || !selectedWork || (!publishTarget && snapshot.pages.length >= 100)} onClick={() => void publish()}>{pending === 'publish' ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}{publishTarget ? 'Publish update' : 'Publish artifact'}</button></div></SpacesDialog>}
  </section>;
}
