import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Bot, Check, ChevronDown, ChevronRight, Circle, Clock3, FileCode2, Files, GitBranch, LoaderCircle, MessageSquare, Pause, Square, Terminal, Wrench, X } from 'lucide-react';
import type { ActivityItem, FileChange, ShellResult, WorkRun, WorkStatus } from '../shared/types';
import './work-activity.css';

const isLive = (status: WorkStatus) => status === 'working' || status === 'waiting' || status === 'queued';
const statusLabels: Record<WorkStatus, string> = { queued: 'Queued', working: 'Working', waiting: 'Waiting', completed: 'Completed', failed: 'Failed', cancelled: 'Stopped', interrupted: 'Interrupted' };

function StatusIcon({ status, size = 13 }: { status: WorkStatus; size?: number }) {
  if (status === 'working') return <LoaderCircle size={size} className="work-spin" aria-hidden="true" />;
  if (status === 'completed') return <Check size={size} aria-hidden="true" />;
  if (status === 'waiting') return <Pause size={size} aria-hidden="true" />;
  if (status === 'failed') return <X size={size} aria-hidden="true" />;
  if (status === 'cancelled' || status === 'interrupted') return <Square size={size - 2} aria-hidden="true" />;
  return <Circle size={size - 2} aria-hidden="true" />;
}

function Status({ status }: { status: WorkStatus }) {
  return <span className={`work-status work-status-${status}`}><StatusIcon status={status} />{statusLabels[status]}</span>;
}

function elapsed(run: WorkRun, now: number) {
  const start = Date.parse(run.startedAt);
  const end = run.endedAt ? Date.parse(run.endedAt) : isLive(run.status) ? now : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function useClock(live: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return now;
}

function itemTitle(item: ActivityItem) {
  return item.title || item.tool || (item.kind === 'agent' ? 'Agent' : item.kind === 'model' ? 'Model activity' : 'Tool activity');
}

function currentActivity(run: WorkRun) {
  return [...run.activities].reverse().find(item => item.status === 'working' || item.status === 'waiting')
    ?? [...run.activities].reverse().find(item => item.status === 'queued');
}

function actionCount(run: WorkRun, shellResults: ShellResult[]) {
  const recorded = run.activities.filter(item => item.kind !== 'model').length;
  // Shell results are a fallback when the runtime did not report tool lifecycle events.
  return recorded || shellResults.filter(result => run.ownedRunIds?.includes(result.runId) || result.runId === run.runId).length;
}

function ActionIcon({ item }: { item: ActivityItem }) {
  if (item.kind === 'agent') return <Bot size={14} aria-hidden="true" />;
  if (item.kind === 'model') return <MessageSquare size={14} aria-hidden="true" />;
  if (/shell|command|terminal/i.test(item.tool)) return <Terminal size={14} aria-hidden="true" />;
  return <Wrench size={14} aria-hidden="true" />;
}

function ActivityDetails({ item, highlighted = false }: { item: ActivityItem; highlighted?: boolean }) {
  const [open, setOpen] = useState(highlighted);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (highlighted) setOpen(true); }, [highlighted]);
  return <details ref={ref} className={`work-activity-item ${highlighted ? 'work-activity-highlight' : ''}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="work-item-icon"><ActionIcon item={item} /></span><span className="work-item-title">{itemTitle(item)}</span><Status status={item.status} /><ChevronRight size={13} className="work-disclosure" aria-hidden="true" /></summary>
    <div className="work-item-body">
      {item.tool && <div className="work-item-meta"><span>{item.kind === 'agent' ? 'Agent task' : item.kind === 'model' ? 'Model' : 'Native tool'}</span><code>{item.tool}</code></div>}
      {item.agentId && <div className="work-item-meta"><span>Agent</span><code>{item.agentId}</code></div>}
      {item.workflow&&<><div className="work-item-meta"><span>Parent run</span><code>{item.workflow.parentRunId}</code></div><p className="work-bound-note">Workflow concurrency limit: {item.workflow.parallelLimit}. This is a limit, not the number of children launched. Child identities, workspaces and individual usage were not reported. Child messaging and stop require the interactive host.</p></>}{item.detail && <p className="work-item-detail">{item.detail}</p>}
      {item.output ? <pre tabIndex={0} aria-label={`${itemTitle(item)} output`}>{item.output}</pre> : <p className="work-no-output">{isLive(item.status) ? 'No output reported yet.' : 'No output reported.'}</p>}
      {item.truncated && <p className="work-bound-note">Only part of this activity’s details or output is retained.</p>}
    </div>
  </details>;
}

function CommandResult({ result }: { result: ShellResult }) {
  const status = result.terminalStatus === 'failed' || result.exitCode !== 0 ? 'failed' : 'completed';
  return <details className="work-activity-item work-command-result"><summary><span className="work-item-icon"><Terminal size={14} aria-hidden="true" /></span><span className="work-item-title">PowerShell result</span><code className="work-exit-code">exit {result.exitCode}</code><Status status={status} /><ChevronRight size={13} className="work-disclosure" aria-hidden="true" /></summary><div className="work-item-body"><span className="work-field-label">Command</span><pre tabIndex={0} aria-label="Native command">{result.command || '(No command text reported)'}</pre><span className="work-field-label">Output</span><pre tabIndex={0} aria-label="Native command output">{result.output || '(No output)'}</pre><p className="work-bound-note">Native outcome: {result.outcome}{result.terminalReason ? ` · ${result.terminalReason}` : ''}</p>{result.truncated && <p className="work-bound-note">Command details or output were shortened.</p>}</div></details>;
}

function RunDetails({ run, shellResults, highlightId }: { run: WorkRun; shellResults: ShellResult[]; highlightId?: string }) {
  const results = shellResults.filter(result => run.ownedRunIds?.includes(result.runId) || result.runId === run.runId);
  return <div className="work-run-details">
    {run.activities.length ? <div className="work-activity-list">{run.activities.map(item => <ActivityDetails key={item.id} item={item} highlighted={item.id === highlightId} />)}</div> : <p className="work-empty-detail">{isLive(run.status) ? 'Waiting for the runtime to report activity.' : 'No activity details were reported for this request.'}</p>}
    {!!results.length && <div className="work-command-results"><p className="work-subheading">Command results <span>{results.length}</span></p>{results.map(result => <CommandResult key={`${result.runId}:${result.callId}`} result={result} />)}</div>}
    {run.reason && <p className={`work-run-reason ${run.status === 'failed' ? 'work-run-error' : ''}`}>{run.reason}</p>}
    {run.truncated && <p className="work-bound-note">This is a partial activity history. Some earlier details or output were omitted.</p>}
  </div>;
}

export function RunActivity({ run, shellResults = [], onOpen }: { run: WorkRun; shellResults?: ShellResult[]; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const live = isLive(run.status);
  const now = useClock(live);
  const duration = elapsed(run, now);
  const current = currentActivity(run);
  const heading = run.status === 'working' ? current && current.kind !== 'model' ? 'Working' : 'Thinking' : run.status === 'completed' ? 'Worked' : statusLabels[run.status];
  return <section className={`run-activity ${live ? 'run-activity-live' : ''}`} aria-label="Request activity" data-run-id={run.id}>
    <div className="run-activity-heading"><button type="button" className="run-activity-toggle" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)}><span className={`work-status-icon work-status-${run.status}`}><StatusIcon status={run.status} /></span><span className="run-activity-label">{heading}{duration ? ` ${run.status==='completed'||run.status==='working'?'for':'after'} ${duration}` : ''}</span><ChevronRight size={13} className={`work-disclosure ${open ? 'is-open' : ''}`} aria-hidden="true" /></button></div>
    {live && <div className="run-current-action" role="status" aria-live="polite"><span className="run-current-line" />{current ? <><span className="run-current-name" title={itemTitle(current)}>{itemTitle(current)}</span>{current.detail && current.detail !== itemTitle(current) && <span className="run-current-detail" title={current.detail}>{current.detail}</span>}</> : <span>{run.status === 'waiting' ? 'Waiting for your input' : run.status === 'queued' ? 'Waiting to start' : 'Muse is thinking…'}</span>}</div>}
    <div id={detailsId} className="run-activity-expanded" hidden={!open}>{open&&<><RunDetails run={run} shellResults={shellResults} /><button type="button" className="work-text-button" onClick={onOpen}>View in Sub-Agents<ArrowUpRight size={13} aria-hidden="true" /></button></>}</div>
  </section>;
}

type ThreadGroup = 'Waiting' | 'Working' | 'Resolved';
const threadGroup = (status: WorkStatus): ThreadGroup => status === 'waiting' || status === 'queued' ? 'Waiting' : status === 'working' ? 'Working' : 'Resolved';
const groups: ThreadGroup[] = ['Waiting', 'Working', 'Resolved'];

export function WorkThreads({ runs, onClose, onStop, onSelectRun, active = true, selectedRunId, shellResults = [] }: {
  runs: WorkRun[];
  onClose: () => void;
  onStop: (runId: string) => void;
  onSelectRun: (runId: string) => void;
  active?: boolean;
  selectedRunId?: string | null;
  shellResults?: ShellResult[];
}) {
  const [tab, setTab] = useState<'tasks' | 'agents'>('tasks');
  const [selected, setSelected] = useState<string | null>(selectedRunId ?? null);
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const pane = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const tabsId = useId();
  const live = runs.some(run => isLive(run.status));
  const now = useClock(active && live);
  const selectedRun = runs.find(run => run.id === selected);
  const agents = runs.flatMap(run => run.activities.filter(item => (item.kind === 'agent'||item.workflow)).map(item => ({ run, item })));
  const sortedRuns = [...runs].reverse();
  useEffect(() => { if (selectedRunId != null) { setSelected(selectedRunId); setSelectedAgent(undefined); } }, [selectedRunId]);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeRef.current(); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected && (pane.current?.contains(document.activeElement) || document.activeElement === document.body)) previous.focus(); };
  }, [active]);
  useEffect(() => {
    if (active && selected) pane.current?.querySelector<HTMLButtonElement>('.work-thread-backbar button')?.focus();
  }, [active, selected]);
  const showRun = (run: WorkRun, agentId?: string) => { setSelected(run.id); setSelectedAgent(agentId); };
  const changeTab = (next: 'tasks' | 'agents') => { setTab(next); setSelected(null); setSelectedAgent(undefined); };
  return <aside ref={pane} className="work-threads" aria-label="Sub-Agents" hidden={!active} inert={!active}>
    <header className="work-threads-heading"><span><GitBranch size={15} aria-hidden="true" /><strong>Sub-Agents</strong></span><button ref={closeButton} type="button" className="icon-button" aria-label="Close Sub-Agents" onClick={onClose}><X size={16} aria-hidden="true" /></button></header>
    {selectedRun ? <div className="work-thread-detail"><div className="work-thread-backbar"><button type="button" className="work-text-button" onClick={() => { setSelected(null); setSelectedAgent(undefined); }}><ArrowLeft size={14} aria-hidden="true" />All {tab === 'agents' ? 'agents' : 'tasks'}</button><Status status={selectedRun.status} /></div><div className="work-thread-detail-scroll"><div className="work-thread-prompt"><span className="work-field-label">Request</span><h2>{selectedRun.prompt || 'Untitled request'}</h2><div className="work-thread-time"><Clock3 size={12} aria-hidden="true" /><time dateTime={selectedRun.startedAt}>{new Date(selectedRun.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>{elapsed(selectedRun, now) && <span>· {elapsed(selectedRun, now)} elapsed</span>}</div></div><div className="work-thread-section-title"><h3>{selectedRun.activities.some(item => item.id === selectedAgent && item.kind === 'agent') ? 'Agent activity' : 'Activity'}</h3><span>{actionCount(selectedRun, shellResults)} actions{selectedRun.truncated ? ' retained' : ''}</span></div><RunDetails run={selectedRun} shellResults={shellResults} highlightId={selectedAgent} /></div><footer className="work-thread-footer"><button type="button" className="work-continue-button" onClick={() => { onSelectRun(selectedRun.id); onClose(); }}><MessageSquare size={14} aria-hidden="true" />Continue in chat<ArrowUpRight size={13} aria-hidden="true" /></button>{isLive(selectedRun.status) && <button type="button" className="work-stop-button" onClick={() => onStop(selectedRun.id)}><Square size={11} aria-hidden="true" />Stop</button>}</footer></div> : <>
      <div className="work-thread-tabs" role="tablist" aria-label="Thread type" onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'tasks' : event.key === 'End' ? 'agents' : tab === 'tasks' ? 'agents' : 'tasks'; changeTab(next); document.getElementById(`${tabsId}-${next}`)?.focus(); } }}><button type="button" id={`${tabsId}-tasks`} role="tab" aria-selected={tab === 'tasks'} aria-controls={`${tabsId}-panel`} tabIndex={tab === 'tasks' ? 0 : -1} onClick={() => changeTab('tasks')}>Tasks<span>{runs.length}</span></button><button type="button" id={`${tabsId}-agents`} role="tab" aria-selected={tab === 'agents'} aria-controls={`${tabsId}-panel`} tabIndex={tab === 'agents' ? 0 : -1} onClick={() => changeTab('agents')}>Agents & workflows<span>{agents.length}</span></button></div>
      <div className="work-thread-list" id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0}>
        {tab === 'tasks' && !runs.length ? <div className="work-threads-empty"><MessageSquare size={24} aria-hidden="true" /><h3>No tasks yet</h3><p>Send a request in this chat to see its activity here.</p></div> : tab === 'agents' && !agents.length ? <div className="work-threads-empty"><Bot size={24} aria-hidden="true" /><h3>No agents or workflows reported</h3><p>This Muse connection reports workflow progress. Individual child-agent updates are not exposed.</p></div> : groups.map(group => {
          const groupRuns = sortedRuns.filter(run => threadGroup(run.status) === group);
          const groupAgents = agents.filter(({ item }) => threadGroup(item.status) === group);
          const count = tab === 'tasks' ? groupRuns.length : groupAgents.length;
          if (!count) return null;
          return <section className="work-thread-group" key={group}><h3>{group}<span>{count}</span></h3>{tab === 'tasks' ? groupRuns.map(run => {
            const current = currentActivity(run);
            const children = run.activities.filter(item => item.kind !== 'model');
            return <div className="work-thread-entry" key={run.id}><button type="button" className="work-thread-row" onClick={() => showRun(run)}><span className={`work-thread-row-icon work-status-${run.status}`}><StatusIcon status={run.status} size={15} /></span><span className="work-thread-row-copy"><strong>{run.prompt || 'Untitled request'}</strong><span>{current && isLive(run.status) ? current.detail || itemTitle(current) : statusLabels[run.status]}{elapsed(run, now) && <> · {elapsed(run, now)}</>}</span></span><ChevronRight size={14} aria-hidden="true" /></button>{!!children.length && <div className="work-thread-children">{children.slice(-3).map(item => <button type="button" className="work-thread-child" key={item.id} onClick={() => showRun(run, item.id)}><span className={`work-status-icon work-status-${item.status}`}><StatusIcon status={item.status} size={11} /></span><span title={item.detail || itemTitle(item)}>{itemTitle(item)}</span><span className="work-child-status">{statusLabels[item.status]}</span></button>)}{children.length > 3 && <button type="button" className="work-thread-more" onClick={() => showRun(run)}>View all {children.length} actions<ChevronRight size={11} aria-hidden="true" /></button>}</div>}</div>;
          }) : groupAgents.map(({ run, item }) => <button type="button" className="work-thread-row" key={`${run.id}:${item.id}`} onClick={() => showRun(run, item.id)}><span className={`work-thread-row-icon work-status-${item.status}`}><Bot size={15} aria-hidden="true" /></span><span className="work-thread-row-copy"><strong>{itemTitle(item)}</strong><span>{statusLabels[item.status]}{item.detail ? ` · ${item.detail}` : ''}</span></span><ChevronRight size={14} aria-hidden="true" /></button>)}</section>;
        })}
      </div><footer className="work-threads-note">{tab==='agents'?'Observed workflow progress. Individual child controls are unavailable on this connection.':'Activity reported by Muse for this chat.'}</footer>
    </>}
  </aside>;
}

const safeCount = (count: number) => Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
const countLabel = (count: number) => count > 999999 ? '999,999+' : count.toLocaleString();

export function ChangedFiles({ files, onOpenFile, onOpenAll }: { files: FileChange[]; onOpenFile: (path: string) => void; onOpenAll: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId(), listId = useId();
  const additions = files.reduce((sum, file) => sum + (file.binary ? 0 : safeCount(file.additions)), 0);
  const deletions = files.reduce((sum, file) => sum + (file.binary ? 0 : safeCount(file.deletions)), 0);
  const approximate = files.some(file => file.approximate);
  const binary = files.some(file => file.binary);
  if (!files.length) return null;
  return <section className="changed-files" aria-labelledby={headingId}>
    <div className="changed-files-heading">
      <span className="changed-files-icon"><Files size={16} aria-hidden="true" /></span>
      <div className="changed-files-summary">
        <strong id={headingId} title="Changes since this chat started">Edited {files.length} {files.length === 1 ? 'file' : 'files'}</strong>
        <span className="changed-files-totals" aria-label={`${approximate ? 'Approximately ' : ''}${countLabel(additions)} additions, ${countLabel(deletions)} deletions`}>
          {approximate && <span className="changed-files-approx" title="Estimated line counts">≈</span>}
          <span className="work-additions">+{countLabel(additions)}</span><span className="work-deletions">−{countLabel(deletions)}</span>
        </span>
      </div>
      <button type="button" className="changed-files-review" onClick={onOpenAll}>View changes</button>
    </div>
    <div className="changed-files-list" id={listId}>
      {(expanded ? files : files.slice(0, 3)).map(file => <button type="button" className="changed-file-row" key={file.path} onClick={() => onOpenFile(file.path)} title={`View ${file.path} · ${file.status}`}>
        <span className="changed-file-path">{file.path}</span>
        {file.binary ? <span className="changed-file-binary">Binary</span> : <span className="changed-file-counts" aria-label={`${file.approximate ? 'Approximately ' : ''}${countLabel(safeCount(file.additions))} additions, ${countLabel(safeCount(file.deletions))} deletions`}>
          {file.approximate && <span title="Estimated line counts">≈</span>}
          <span className="work-additions">+{countLabel(safeCount(file.additions))}</span><span className="work-deletions">−{countLabel(safeCount(file.deletions))}</span>
        </span>}
      </button>)}
    </div>
    {files.length > 3 && <button type="button" className="changed-files-more" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Show fewer files' : `Show ${files.length - 3} more ${files.length - 3 === 1 ? 'file' : 'files'}`}<ChevronDown size={14} className={expanded ? 'rotated' : ''} aria-hidden="true" />
    </button>}
    {(approximate || binary || additions > 999999 || deletions > 999999) && <p className="changed-files-note">{approximate && 'Some line counts are estimates. '}{binary && 'Binary files are excluded from line totals. '}{(additions > 999999 || deletions > 999999) && 'Counts above 999,999 are shown as 999,999+.'}</p>}
  </section>;
}
