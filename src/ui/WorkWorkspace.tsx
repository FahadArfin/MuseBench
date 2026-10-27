import {UpdateToolbar} from './AppUpdates';
import {NavigationButtons} from './NavigationHistory';
import {useContext} from 'react';
import {BrowserPreviewContext} from './BrowserPreviewContext';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, BriefcaseBusiness, Check, ChevronDown, CircleAlert, Clapperboard, Code2, ExternalLink, FileJson2, FileText, FolderOpen, LayoutDashboard, LoaderCircle, MessageSquare, PanelLeft, Paperclip, Play, Presentation, RefreshCw, Search, Settings2, Square, SquarePen, X, type LucideIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WorkArtifact, WorkCommand, WorkExport, WorkKind, WorkState, WorkTeam } from '../shared/work-types';
import { WORK_EXAMPLES, WORK_KINDS, WORK_TEAMS, createWorkDraft, filterWorkTemplates, workExportOptions, type WorkTemplate } from '../shared/work-catalog.mjs';
import {resolveTheme,type Preferences} from './preferences.mjs';
import { RunActivity, WorkThreads } from './WorkActivity';
import './workspace-work.css';

const kindIcons: Record<WorkKind, LucideIcon> = { dashboard: LayoutDashboard, motion: Clapperboard, document: FileText, slides: Presentation };
const activeStatuses = ['running', 'starting', 'submitting', 'connecting', 'checking-permissions'];
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error || 'The request could not be completed.');
const emptyState = (error: string): WorkState => ({ items: [], activeId: null, item: null, task: null, runtime: { status: 'unavailable', reason: null, binary: null, sdkVersion: '', liveVerified: false }, busy: false, error, artifact: null, artifactError: null, artifactUpdatedAt: null, capabilities: { mp4: false } });
const kindLabel = (kind: WorkKind) => WORK_KINDS.find(item => item.id === kind)?.label ?? kind;
const teamLabel = (team: WorkTeam) => WORK_TEAMS.find(item => item.id === team)?.label ?? team;
const shortDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const sourceSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function useWork(): { state: WorkState | null; command: (command: WorkCommand) => Promise<void>; importSources: () => Promise<void>; exportArtifact: (format: WorkExport) => Promise<boolean> } {
  const bridge = window.musebench;
  const [state, setState] = useState<WorkState | null>(null);
  const alive = useRef(true);
  const eventVersion = useRef(0);
  const report = useCallback((error: unknown) => { if (alive.current) setState(current => ({ ...(current ?? emptyState(errorText(error))), error: errorText(error) })); }, []);
  useEffect(() => {
    alive.current = true;
    if (!bridge?.workState || !bridge.onWorkState) { report('Work is available in the MuseBench desktop app. Reopen the app if this connection is unavailable.'); return () => { alive.current = false; }; }
    const version = eventVersion.current;
    const dispose = bridge.onWorkState(next => { eventVersion.current++; if (alive.current) setState(next); });
    void bridge.workState().then(next => { if (alive.current && version === eventVersion.current) setState(next); }).catch(report);
    return () => { alive.current = false; dispose(); };
  }, [bridge, report]);
  const command = useCallback(async (request: WorkCommand) => {
    try {
      if (!bridge?.work) throw new Error('The Work connection is unavailable. Reopen MuseBench to reconnect.');
      const version = eventVersion.current;
      const next = await bridge.work(request);
      if (alive.current && version === eventVersion.current) setState(next);
      if (next.error) throw new Error(next.error);
    } catch (error) { report(error); throw error; }
  }, [bridge, report]);
  const importSources = useCallback(async () => {
    try {
      if (!bridge?.workImport) throw new Error('Source import is unavailable. Reopen MuseBench to reconnect.');
      const version = eventVersion.current;
      const next = await bridge.workImport();
      if (alive.current && version === eventVersion.current) setState(next);
      if (next.error) throw new Error(next.error);
    } catch (error) { report(error); throw error; }
  }, [bridge, report]);
  const exportArtifact = useCallback(async (format: WorkExport) => {
    try {
      if (!bridge?.workExport) throw new Error('Artifact export is unavailable. Reopen MuseBench to reconnect.');
      const result = await bridge.workExport(format);
      return result.saved === true;
    } catch (error) { report(error); throw error; }
  }, [bridge, report]);
  return { state, command, importSources, exportArtifact };
}

export function WorkSidebar({ state, onNew, onSelect, disabled = false, children, searchOpen, onSearchOpenChange }: { state: WorkState | null; onNew: () => void; onSelect: (id: string) => void | Promise<void>; disabled?: boolean; children?: ReactNode; searchOpen: boolean; onSearchOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(true);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => { if (searchOpen) { setExpanded(true); search.current?.focus(); } else setQuery(''); }, [searchOpen]);
  const [error, setError] = useState('');
  const items = (state?.items ?? []).filter(item => `${item.title} ${item.team} ${item.kind}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const select = async (id: string) => { setError(''); try { await onSelect(id); } catch (caught) { setError(errorText(caught)); } };
  return <div className="work-library">
    <button type="button" className="navigation-row work-new" onClick={onNew} disabled={disabled}><SquarePen size={16} /><span>New work</span></button>
    {children}
    <div className="section-label work-recents-heading"><button className="sidebar-section-toggle" type="button" aria-expanded={expanded || !!query} aria-controls={listId} onClick={()=>{setExpanded(!expanded);setQuery('');}}>Recents<ChevronDown size={12} className={expanded ? '' : 'folded'}/></button><button className="icon-button" type="button" aria-label="Search saved work" aria-expanded={searchOpen} onClick={()=>{onSearchOpenChange(!searchOpen);setExpanded(true);}}><Search size={15}/></button></div>
    <label className="work-sidebar-search" hidden={!searchOpen}><Search size={14} /><input ref={search} aria-label="Search saved work" placeholder="Search your work" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear saved work search" onClick={() => setQuery('')}><X size={13} /></button>}</label>
    <nav id={listId} className="work-library-list" aria-label="Saved work" hidden={!expanded && !query}>
      {items.map(item => { const Icon = kindIcons[item.kind]; return <button key={item.id} type="button" className={`work-library-item ${state?.activeId === item.id ? 'selected' : ''}`} aria-current={state?.activeId === item.id ? 'page' : undefined} title={item.title} disabled={disabled} onClick={() => void select(item.id)}><Icon size={15} /><span><strong>{item.title}</strong><small>{teamLabel(item.team)}{item.demo ? ' · Sample' : ''}</small></span><time dateTime={item.updatedAt}>{shortDate(item.updatedAt)}</time></button>; })}
      {!items.length && <p className="work-library-empty">{!state ? 'Loading your work…' : query ? 'No work matches your search.' : 'Your dashboards, stories, and documents will appear here.'}</p>}
    </nav>
    {error && <p className="work-sidebar-error" role="alert">{error}</p>}
  </div>;
}

function OutputVisual({ kind, compact = false }: { kind: WorkKind; compact?: boolean }) {
  return <div className={`work-output-visual work-visual-${kind} ${compact ? 'compact' : ''}`} aria-hidden="true">
    {kind === 'dashboard' ? <div className="work-visual-dashboard"><div className="work-visual-metrics"><i /><i /><i /></div><div className="work-visual-chart">{[36, 54, 43, 69, 61, 83, 74, 95].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div> : kind === 'motion' ? <div className="work-visual-motion"><span className="work-orbit orbit-one" /><span className="work-orbit orbit-two" /><span className="work-motion-play"><Play size={21} fill="currentColor" /></span><div className="work-motion-timeline"><i /><i /><i /><i /></div></div> : kind === 'document' ? <div className="work-visual-document"><i className="work-document-title" /><i /><i /><i className="work-document-short" /><span /><i /><i /><i className="work-document-short" /></div> : <div className="work-visual-slides"><span className="work-slide-back" /><span className="work-slide-front"><i /><i /><span><i /><i /><i /></span></span></div>}
  </div>;
}

const featured = ['finance-dashboard', 'marketing-motion', 'operations-document', 'sales-slides', 'analytics-dashboard', 'engineering-motion'];

function WorkHome({ pending, ready, onCreate }: { pending: boolean; ready: boolean; onCreate: (template: WorkTemplate) => Promise<void> }) {
  const [team, setTeam] = useState<WorkTeam | 'all'>('all');
  const [kind, setKind] = useState<WorkKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [brief, setBrief] = useState('');
  const templates = useMemo(() => filterWorkTemplates({ team, kind, query }).sort((a, b) => { const ai = featured.indexOf(a.id); const bi = featured.indexOf(b.id); return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi); }), [team, kind, query]);
  useEffect(() => setExpanded(false), [team, kind, query]);
  const createCustom = () => onCreate({ id: 'custom', title: brief.trim().split(/\r?\n/)[0].slice(0, 80) || 'Untitled work', team: team === 'all' ? 'analytics' : team, kind: kind === 'all' ? 'dashboard' : kind, description: '', brief: brief.trim(), sample: false });
  return <div className="work-home-scroll"><div className="work-home">
    <div className="work-home-heading"><span className="work-eyebrow"><BriefcaseBusiness size={14} />A space for your work</span><h1>What would you like to make?</h1><p>Bring your sources. Build something you can use.</p></div>
    <div className="work-output-grid" aria-label="Choose an output type">{WORK_KINDS.map(output => { const Icon = kindIcons[output.id]; return <button key={output.id} type="button" className={`work-output-card ${kind === output.id ? 'selected' : ''}`} aria-pressed={kind === output.id} onClick={() => setKind(kind === output.id ? 'all' : output.id)}><OutputVisual kind={output.id} /><span className="work-output-label"><Icon size={16} /><strong>{output.label}</strong><ArrowRight size={14} /></span><span className="work-output-description">{output.description}</span></button>; })}</div>
    <section className="work-template-section" aria-labelledby="work-template-title">
      <div className="work-section-heading"><h2 id="work-template-title">Start with a template</h2><label className="work-template-search"><Search size={14} /><input data-work-search aria-label="Search work templates" placeholder="Search templates" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear template search" onClick={() => setQuery('')}><X size={13} /></button>}</label></div>
      <div className="work-team-filters" aria-label="Filter templates by team"><button type="button" className={team === 'all' ? 'selected' : ''} aria-pressed={team === 'all'} onClick={() => setTeam('all')}>All teams</button>{WORK_TEAMS.map(item => <button key={item.id} type="button" className={team === item.id ? 'selected' : ''} aria-pressed={team === item.id} onClick={() => setTeam(item.id)}>{item.label}</button>)}</div>
      {kind !== 'all' && <div className="work-filter-summary"><span>{kindLabel(kind)} templates</span><button type="button" onClick={() => setKind('all')}>Show all outputs<X size={12} /></button></div>}
      <div className="work-template-grid">{(expanded ? templates : templates.slice(0, 6)).map(template => { const Icon = kindIcons[template.kind]; return <button key={template.id} type="button" className="work-template-card" disabled={pending || !ready} onClick={() => void onCreate(template)}><span className="work-template-icon"><Icon size={17} /></span><span className="work-template-copy"><strong>{template.title}</strong><span>{template.description}</span><small>{teamLabel(template.team)}<span>·</span>{kindLabel(template.kind)}</small></span><ArrowRight size={14} /></button>; })}</div>
      {!templates.length && <div className="work-template-empty"><Search size={20} /><p>No templates match those filters.</p><button type="button" className="text-link" onClick={() => { setTeam('all'); setKind('all'); setQuery(''); }}>Clear filters</button></div>}
      {templates.length > 6 && <button type="button" className="work-show-templates" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer templates' : `Browse all ${templates.length} templates`}<ChevronDown size={13} className={expanded ? 'expanded' : ''} /></button>}
    </section>
    <section className="work-custom-section" aria-label="Create your own work"><div><h2>Have something else in mind?</h2><p>Describe it, then add sources and refine your brief.</p></div><form onSubmit={event => { event.preventDefault(); if (brief.trim() && !pending && ready) void createCustom(); }}><textarea aria-label="Describe your work" placeholder="A monthly customer report, a process explainer, a launch presentation…" value={brief} onChange={event => setBrief(event.target.value)} rows={2} maxLength={12000} /><div className="work-custom-toolbar"><label><span className="sr-only">Custom work team</span><select aria-label="Custom work team" value={team === 'all' ? 'analytics' : team} onChange={event => setTeam(event.target.value as WorkTeam)}>{WORK_TEAMS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={12} /></label><label><span className="sr-only">Custom work output</span><select aria-label="Custom work output" value={kind === 'all' ? 'dashboard' : kind} onChange={event => setKind(event.target.value as WorkKind)}>{WORK_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={12} /></label><button className="button compact" type="submit" disabled={!brief.trim() || pending || !ready}>{pending ? <LoaderCircle size={13} className="spin" /> : <ArrowRight size={13} />}Create draft</button></div></form></section>
    <section className="work-gallery" aria-labelledby="work-gallery-title"><div className="work-section-heading"><div><h2 id="work-gallery-title">A little inspiration</h2><p>Open a sample to explore what you can make.</p></div></div><div className="work-gallery-grid">{WORK_EXAMPLES.map(sample => <button key={sample.id} type="button" className="work-gallery-card" disabled={pending || !ready} onClick={() => void onCreate(sample)}><span className="work-sample-label">Sample</span><OutputVisual kind={sample.kind} compact /><strong>{sample.title}</strong><span>{sample.description}</span><small>{kindLabel(sample.kind)}<ArrowRight size={12} /></small></button>)}</div></section>
    <p className="work-home-footnote">Templates open as editable drafts. Muse starts only when you send a message.</p>
  </div></div>;
}

export interface WorkWorkspaceProps {
  active: boolean; obscured: boolean; state: WorkState | null;
  command: (command: WorkCommand) => Promise<void>; importSources: () => Promise<void>; exportArtifact: (format: WorkExport) => Promise<boolean>;
  onNavigationOpen: () => void; onToggleSidebar: () => void; collapsed: boolean; onSettings: () => void; modeSwitch: ReactNode; preferences: Preferences;
  home?: boolean; onHomeChange?: (home: boolean) => void;
}

export function WorkWorkspace({ active, obscured, state, command, importSources, exportArtifact, onNavigationOpen, onToggleSidebar, collapsed, onSettings, modeSwitch, preferences, home, onHomeChange }: WorkWorkspaceProps) {
  const browserPreview=useContext(BrowserPreviewContext);
  const [localHome, setLocalHome] = useState(true);
  const [pending, setPending] = useState('');
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [message, setMessage] = useState('');
  const [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const [artifactTab, setArtifactTab] = useState<'preview' | 'edit'>('preview');
  const [editor, setEditor] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [activityRun, setActivityRun] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewTheme,setPreviewTheme]=useState(()=>resolveTheme(preferences.theme,window.matchMedia('(prefers-color-scheme: dark)').matches));
  const previewArtifactKey=browserPreview.artifact&&state?.artifact?JSON.stringify(state.artifact):'';
  const previewDocument=useMemo(()=>previewArtifactKey?browserPreview.artifact?.(JSON.parse(previewArtifactKey),previewTheme):undefined,[browserPreview.artifact,previewArtifactKey,previewTheme]);
  useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const sync=()=>setPreviewTheme(resolveTheme(preferences.theme,media.matches));sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[preferences.theme]);
  const [sendFailed, setSendFailed] = useState(false);
  const draftMap = useRef(new Map<string, string>());
  const editorDrafts = useRef(new Map<string,string>());
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const exportRoot = useRef<HTMLDivElement>(null);
  const exportTrigger = useRef<HTMLButtonElement>(null);
  const exportMenu = useRef<HTMLDivElement>(null);
  const exportId = useId();
  const paneId = useId();
  const item = state?.item;
  const task = state?.task;
  const showingHome = (home ?? localHome) || !item;
  const running = Boolean(state && (activeStatuses.includes(state.runtime.status) || state.task?.runs?.some(run => ['working', 'queued', 'waiting'].includes(run.status))));
  const blocked = Boolean(pending || state?.busy || running || !state);
  const error = localError || state?.error;
  const setHome = (next: boolean) => { setLocalHome(next); onHomeChange?.(next); setLocalError(''); setNotice(''); };
  const safely = async (action: () => Promise<unknown>, operation = '') => {
    setLocalError(''); setNotice(''); if (operation) setPending(operation);
    try { await action(); return true; } catch (caught) { setLocalError(errorText(caught)); return false; } finally { if (operation) setPending(''); }
  };
  const create = async (template: WorkTemplate) => {
    const success = await safely(() => command(createWorkDraft(template, { reasoning: preferences.defaultReasoning, approval: preferences.defaultApproval })), 'create');
    if (success) { setPane('chat'); setHome(false); }
  };
  const updateMessage = (value: string) => { setMessage(value); if (item) draftMap.current.set(item.id, value); };
  const submit = async () => {
    if (!message.trim() || blocked || !item) return;
    const sent = message.trim(); const id = item.id; setSendFailed(false);
    const success = await safely(() => command({ type: 'send', text: sent }), 'send');
    setSendFailed(!success);
    if (success && draftMap.current.get(id)?.trim() === sent) { draftMap.current.set(id, ''); setMessage(current => current.trim() === sent ? '' : current); }
  };
  const save = async () => {
    await safely(async () => { let artifact: WorkArtifact; try { artifact = JSON.parse(editor); } catch { throw new Error('This is not valid JSON. Check the data structure before saving.'); } await command({ type: 'saveArtifact', artifact }); if(item)editorDrafts.current.delete(item.id); setEditorDirty(false); setNotice('Artifact data saved.'); }, 'save');
  };
  const exportFile = async (format: WorkExport) => {
    setExportOpen(false);
    await safely(async () => { if (await exportArtifact(format)) setNotice('Export saved.'); }, 'export');
  };
  useEffect(() => {
    setLocalError(''); setNotice(''); setActivityRun(null); setArtifactTab('preview'); const draft=item?editorDrafts.current.get(item.id):undefined; setEditorDirty(draft!==undefined); setEditor(draft ?? (state?.artifact?JSON.stringify(state.artifact,null,2):'')); setPreviewFailed(false); setSendFailed(false); followTranscript.current = true;
    if (!item) { setMessage(''); return; }
    const initial = draftMap.current.get(item.id) ?? (!task?.runs?.length ? task?.request ?? '' : '');
    draftMap.current.set(item.id, initial); setMessage(initial); setPane('chat');
  }, [item?.id]);
  useEffect(() => { if (!item || !editorDrafts.current.has(item.id)) setEditor(state?.artifact ? JSON.stringify(state.artifact, null, 2) : ''); }, [state?.artifact, state?.artifactUpdatedAt, item?.id, editorDirty]);
  useEffect(() => { setPreviewFailed(false); }, [item?.id, state?.artifactUpdatedAt]);
  useEffect(() => { if (transcript.current && followTranscript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [task?.messages, task?.runs, item?.id, running]);
  useEffect(() => { const element = composer.current; if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 220)}px`; } }, [message, showingHome]);
  useEffect(() => { if (!active || obscured) { setExportOpen(false); setActivityRun(null); } }, [active, obscured]);
  useEffect(() => {
    if (!exportOpen) return;
    const outside = (event: PointerEvent) => { if (!exportRoot.current?.contains(event.target as Node)) setExportOpen(false); };
    document.addEventListener('pointerdown', outside);
    const frame = requestAnimationFrame(() => exportMenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    return () => { document.removeEventListener('pointerdown', outside); cancelAnimationFrame(frame); };
  }, [exportOpen]);
  const exportKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setExportOpen(false); exportTrigger.current?.focus(); return; }
    if (event.key === 'Tab') { setExportOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const items = Array.from(exportMenu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []); const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const messages = (task?.messages ?? []).filter(entry => entry.role !== 'system');
  const options = workExportOptions(state?.artifact ?? null, state?.capabilities);
  return <section className="workspace work-workspace" hidden={!active} inert={!active || obscured ? true : undefined} aria-label="Work workspace">
    <header className="topbar work-topbar"><button type="button" className="icon-button mobile-toggle" aria-label="Open navigation" onClick={onNavigationOpen}><PanelLeft size={17} /></button>{collapsed && <button type="button" className="icon-button collapsed-toggle" aria-label="Show sidebar" onClick={onToggleSidebar}><PanelLeft size={17} /></button>}<NavigationButtons/>{!showingHome && <div className="work-task-breadcrumb"><button type="button" className="icon-button" aria-label="Back to Work home" onClick={() => setHome(true)}><ArrowLeft size={15} /></button><span title={item?.title}>{item?.title}</span>{item?.demo && <span className="work-inline-sample">Sample</span>}</div>}<div className="work-topbar-spacer" />{showingHome && running && item && <button type="button" className="work-return-running" onClick={() => setHome(false)}><LoaderCircle size={13} className="spin" /><span>Return to active work</span><ArrowRight size={13} /></button>}<button type="button" className="icon-button" aria-label="Work settings" title="MuseBench settings" onClick={onSettings}><Settings2 size={16} /></button><UpdateToolbar/></header>
    {modeSwitch && <div className="workspace-mode-row">{modeSwitch}</div>}
    {error && <div className="work-banner error" role="alert"><CircleAlert size={15} /><div><strong>Work needs attention</strong><p>{error}</p></div><button type="button" className="icon-button" aria-label="Dismiss Work error" onClick={() => { setLocalError(''); void safely(() => command({ type: 'clearError' })); }}><X size={14} /></button></div>}
    {notice && <div className="work-banner notice" role="status"><Check size={15} /><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss Work notice" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {showingHome ? <WorkHome pending={blocked} ready={Boolean(state)} onCreate={create} /> : <>
      <div className="work-mobile-tabs" role="tablist" aria-label="Workspace pane"><button id={`${paneId}-chat-tab`} type="button" role="tab" aria-selected={pane === 'chat'} aria-controls={`${paneId}-chat`} className={pane === 'chat' ? 'selected' : ''} onClick={() => setPane('chat')}><MessageSquare size={14} />Chat</button><button id={`${paneId}-preview-tab`} type="button" role="tab" aria-selected={pane === 'preview'} aria-controls={`${paneId}-preview`} className={pane === 'preview' ? 'selected' : ''} onClick={() => setPane('preview')}><LayoutDashboard size={14} />Preview</button></div>
      <div className={`work-studio work-pane-${pane}`}>
        <section className="work-conversation" id={`${paneId}-chat`} aria-label="Work conversation">
          <div className="work-conversation-scroll" ref={transcript} onScroll={() => { const node = transcript.current; if (node) followTranscript.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; }}>
            <div className="work-task-context"><span>{item && teamLabel(item.team)}<span>·</span>{item && kindLabel(item.kind)}</span><h1>{item?.title}</h1>{!task?.runs?.length && <p>{item?.demo ? 'Explore this sample, then adapt it with your own sources.' : 'Your draft is ready. Add sources and make the brief your own.'}</p>}</div>
            {state?.runtime.reason && !running && (sendFailed || task?.runs?.at(-1)?.status === 'failed') && <div className="work-connection-hint"><CircleAlert size={16} /><div><strong>Muse connection</strong><p>{state.runtime.reason}</p><button type="button" className="text-link" onClick={() => void safely(async () => { if (!window.musebench?.openExternal) throw new Error('Opening documentation is unavailable. Visit dev.meta.ai/docs/muse-code.'); await window.musebench.openExternal('https://dev.meta.ai/docs/muse-code'); })}>Official Muse setup<ExternalLink size={12} /></button></div></div>}
            {state && ['blocked','uncertain','error','failed'].includes(state.runtime.status) && !state.runtime.permissionVerified && <div className="work-connection-hint"><CircleAlert size={16}/><div><strong>Muse connection needs attention</strong><p>{state.runtime.reason || 'Reset this connection, then send again to recheck the sandbox.'}</p><button type="button" className="button compact" disabled={state.runtime.cleanup==='unconfirmed'||Boolean(pending)} onClick={()=>void safely(()=>command({type:'stop'}),'reset')}>Reset Muse connection</button></div></div>}
            {messages.map(entry => <div key={entry.id} id={`work-message-${entry.id}`}><article className={`message ${entry.role}-message`}>{entry.role === 'assistant' && <div className="assistant-label"><BriefcaseBusiness size={13} />Muse</div>}{entry.role === 'user' ? <p>{entry.text}</p> : <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <span className="message-link" title={href}>{children}</span>, img: ({ alt }) => <span className="muted">{alt || 'Image reference'}</span> }}>{entry.text}</Markdown></div>}</article>{entry.role === 'user' && task?.runs?.filter(run => run.promptId === entry.id).map(run => <RunActivity key={run.id} run={run} shellResults={task.shellResults} onOpen={() => setActivityRun(run.id)} />)}</div>)}
            {task?.runs?.filter(run => !messages.some(entry => entry.id === run.promptId)).map(run => <RunActivity key={run.id} run={run} shellResults={task.shellResults} onOpen={() => setActivityRun(run.id)} />)}
            {running && !task?.runs?.length && <p className="work-runtime-status" role="status"><LoaderCircle size={14} className="spin" />{state?.runtime.status || 'Working'}</p>}
          </div>
          <div className="work-compose-region">
            {!!item?.sources.length && <div className="work-source-chips" aria-label="Attached sources">{item.sources.map(source => <span key={source.id} title={`${source.name} · ${sourceSize(source.bytes)}`}><FileText size={12} /><span>{source.name}</span><small>{sourceSize(source.bytes)}</small></span>)}</div>}
            <form className="work-composer" onSubmit={event => { event.preventDefault(); void submit(); }}><textarea ref={composer} aria-label="Work brief and message" placeholder={state?.artifact ? 'What would you like to change?' : 'Describe what you want to make…'} value={message} onChange={event => updateMessage(event.target.value)} onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter' && !event.shiftKey && (preferences.enterToSend ? !event.ctrlKey && !event.metaKey : event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit(); } }} maxLength={12000} rows={3} /><div className="work-compose-toolbar"><button type="button" className="work-attach" disabled={blocked || (item?.sources.length ?? 0) >= 8} title="Attach CSV, JSON, MD, or TXT · up to 8 files, 2 MB each" onClick={() => void safely(importSources, 'import')}><Paperclip size={15} /><span>Attach sources</span></button><span className="work-compose-spacer" />{running || pending === 'send' ? <button type="button" className="work-stop" aria-label="Stop generating work" onClick={() => void safely(() => command({ type: 'stop' }))}><Square size={12} fill="currentColor" />Stop</button> : <button type="submit" className="send-button" aria-label="Send Work message" title="Send to Muse" disabled={blocked || !message.trim()}><ArrowUp size={17} /></button>}</div></form>
            <div className="work-compose-footnote"><span>CSV, JSON, MD, TXT · 8 files · 2 MB each</span><span>{preferences.enterToSend ? 'Enter to send' : 'Ctrl ↵ to send'}</span></div><p className="work-source-privacy">Sources stay local until you send. First Send checks your installed Muse CLI and sandbox.</p>
          </div>
        </section>
        <section className="work-artifact-pane" id={`${paneId}-preview`} aria-label="Work artifact">
          <div className="work-artifact-toolbar"><div className="work-artifact-tabs" role="tablist" aria-label="Artifact view"><button id={`${paneId}-render-tab`} type="button" role="tab" aria-selected={artifactTab === 'preview'} aria-controls={`${paneId}-render`} className={artifactTab === 'preview' ? 'selected' : ''} onClick={() => setArtifactTab('preview')}><Play size={13} />Preview</button><button id={`${paneId}-data-tab`} type="button" role="tab" aria-selected={artifactTab === 'edit'} aria-controls={`${paneId}-data`} className={artifactTab === 'edit' ? 'selected' : ''} disabled={!state?.artifact} onClick={() => setArtifactTab('edit')}><Code2 size={14} />Edit data</button></div><div className="work-artifact-actions"><button type="button" className="icon-button" aria-label="Refresh artifact" title="Read latest artifact" disabled={Boolean(pending || state?.busy)} onClick={() => void safely(() => command({ type: 'refresh' }), 'refresh')}><RefreshCw size={14} className={pending === 'refresh' ? 'spin' : ''} /></button><div className="work-export" ref={exportRoot}><button ref={exportTrigger} type="button" className="work-export-trigger" aria-label="Export artifact" aria-haspopup="menu" aria-expanded={exportOpen} aria-controls={exportId} disabled={!state?.artifact || Boolean(pending)} onClick={() => setExportOpen(!exportOpen)}>{pending === 'export' ? <LoaderCircle size={14} className="spin" /> : <ArrowDownToLine size={14} />}<span>Export</span><ChevronDown size={12} /></button>{exportOpen && <div id={exportId} className="work-export-menu" ref={exportMenu} role="menu" aria-label="Export format" onKeyDown={exportKeyDown}>{options.map(option => <button key={option.format} type="button" role="menuitem" disabled={!option.enabled} title={option.enabled ? `Save ${option.label}` : option.reason} onClick={() => void exportFile(option.format)}><span>{option.label}</span><small>.{option.format}</small></button>)}{!state?.capabilities.mp4 && state?.artifact?.kind === 'motion' && <p>MP4 export requires FFmpeg.</p>}</div>}</div></div></div>
          {state?.artifactError && <div className="work-artifact-warning" role="alert"><CircleAlert size={14} /><div><strong>{state.artifact ? 'Showing the last valid artifact' : 'Artifact could not be opened'}</strong><p>{state.artifactError}</p></div></div>}
          <div id={`${paneId}-render`} role="tabpanel" aria-labelledby={`${paneId}-render-tab`} className="work-preview-content" hidden={artifactTab !== 'preview'}>
            {state?.artifact && item ? previewFailed ? <div className="work-preview-empty"><CircleAlert size={28} /><h2>The preview could not load</h2><p>Your artifact data is still available. Refresh the artifact or use Edit data to inspect it.</p><button type="button" className="button" onClick={() => setPreviewFailed(false)}>Try again</button></div> : <iframe key={`${item.id}:${state.artifactUpdatedAt}:${previewTheme}`} title={`${item.title} artifact preview`} srcDoc={previewDocument} src={browserPreview.artifact?undefined:`musebench-artifact://preview/${encodeURIComponent(item.id)}?rev=${encodeURIComponent(state.artifactUpdatedAt ?? '')}&theme=${previewTheme}`} sandbox="allow-scripts" referrerPolicy="no-referrer" onError={() => setPreviewFailed(true)} /> : <div className="work-preview-empty">{item && (() => { const Icon = kindIcons[item.kind]; return <Icon size={30} />; })()}<h2>{running ? 'Your work is taking shape' : 'Your preview will appear here'}</h2><p>{running ? 'The preview updates when Muse writes a valid artifact.' : 'Attach your sources and send the brief to Muse. You can refine the result in chat or edit its data.'}</p>{running && <LoaderCircle size={18} className="spin" />}</div>}
          </div>
          <div id={`${paneId}-data`} role="tabpanel" aria-labelledby={`${paneId}-data-tab`} className="work-data-editor" hidden={artifactTab !== 'edit'}><div className="work-editor-heading"><span><FileJson2 size={14} />Artifact JSON</span><small>{editorDirty ? 'Unsaved changes' : 'Saved'}</small></div><p>Edit the content and chart data. Saving validates the artifact before updating the preview.</p><textarea aria-label="Edit artifact JSON" value={editor} onChange={event => { setEditor(event.target.value); setEditorDirty(true); if(item)editorDrafts.current.set(item.id,event.target.value); }} spellCheck={false} /><div className="work-editor-actions"><button type="button" className="button compact" disabled={!editorDirty || blocked} onClick={() => { if(item)editorDrafts.current.delete(item.id); setEditor(state?.artifact ? JSON.stringify(state.artifact, null, 2) : ''); setEditorDirty(false); }}>Reset changes</button><button type="button" className="button compact primary" disabled={!editorDirty || blocked} onClick={() => void save()}>{pending === 'save' ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}Save data</button></div></div>
          {state?.artifact && <div className="work-artifact-footer"><span>{kindLabel(state.artifact.kind)}{item?.demo ? ' · Sample content' : ''}</span><span>{state.artifact.sources.length} {state.artifact.sources.length === 1 ? 'source reference' : 'source references'}</span></div>}
        </section>
      </div>
      {activityRun && task && <div className="work-activity-overlay"><WorkThreads runs={task.runs ?? []} selectedRunId={activityRun} shellResults={task.shellResults} active={active && !obscured} onClose={() => setActivityRun(null)} onStop={() => void safely(() => command({ type: 'stop' }))} onSelectRun={id => { setActivityRun(null); setPane('chat'); const run = task.runs?.find(entry => entry.id === id); if (run) document.getElementById(`work-message-${run.promptId}`)?.scrollIntoView({ block: 'start', behavior: preferences.reducedMotion ? 'instant' : 'smooth' }); }} /></div>}
    </>}
  </section>;
}
