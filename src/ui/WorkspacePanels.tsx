import {DiscoveryTools} from './DiscoveryTools';
import type {DiscoverySelection} from '../shared/tool-discovery.mjs';
import {WorkspaceToolOptions} from './WorkspaceToolOptions';
import type {WorkspaceToolset} from '../shared/workspace-analysis.mjs';
import {NativeQuestion} from './NativeQuestion';
import {ValidationPanel} from './ValidationPanel';
import {ProjectActions} from './ProjectActions';
import {ProjectPreview} from './ProjectPreview';
import {ConnectionDiagnostics} from './ConnectionDiagnostics';
import {RuntimeCapabilities} from './RuntimeCapabilities';
import {computeFileDiff} from '../shared/file-diff.mjs';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {MotionDisclosure} from './MotionDisclosure';
import { Check, ChevronDown, ChevronRight, Circle, ExternalLink, FileCode2, Files, FolderOpen, History, Info, LoaderCircle, Play, RefreshCw, ShieldCheck, Square, Terminal, X } from 'lucide-react';
import type { Action, AppState, FileChange, ShellResult } from '../shared/types';
import { permissionDetails } from './permissions.mjs';
import './panels.css';

type Act = (action: Action) => Promise<AppState | null>;
const short = (value: string | null | undefined) => value ? value.slice(0, 8) : '—';
const when = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Modal({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length > 0);
    (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal ${className}`}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={18} /></button></div>{children}</div></div>;
}

export function Diff({ file, taskId }: { file: FileChange; taskId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const comparison = useMemo(() => computeFileDiff(file.before, file.after), [file.before, file.after]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current) menu.current.open = false; };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);
  const open = async (editor: 'preferred'|'vscode'|'choose') => {
    if (menu.current) menu.current.open = false;
    setError(''); setOpening(true);
    try { if (!window.musebench) throw Error('Open this file from the MuseBench desktop app.'); await window.musebench.openProjectFile({taskId, path:file.path, editor}); }
    catch (error) { setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error)); }
    finally { setOpening(false); }
  };
  const unavailable = file.status === 'deleted';
  return <section className="diff" data-file-path={file.path} aria-label={`Changes in ${file.path}`}>
    <div className="diff-toolbar">
      <button className="diff-file-toggle" aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed(!collapsed)} title={file.path}>
        <ChevronRight className="diff-disclosure" size={13}/><FileCode2 size={14}/><span>{file.path}</span>
      </button>
      <div className="diff-file-actions">
        {file.binary ? <span className="diff-file-kind">Binary</span> : <span className="diff-counts"><span className="additions">{file.approximate?'~':''}+{file.additions}</span><span className="deletions">−{file.deletions}</span></span>}
        <button className="icon-button" disabled={opening || unavailable} aria-label={`Open ${file.path} in editor`} title={unavailable?'Deleted file': 'Open in preferred editor (VS Code by default)'} onClick={() => void open('preferred')}><ExternalLink size={14}/></button>
        {!unavailable && <details className="diff-editor-menu" ref={menu} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.open=false;}}><summary className="icon-button" aria-label={`Choose editor for ${file.path}`} title="Choose editor"><ChevronDown size={12}/></summary><div><button disabled={opening} onClick={()=>void open('vscode')}>Open in VS Code</button><button disabled={opening} onClick={()=>void open('choose')}>Choose preferred editor…</button></div></details>}
      </div>
    </div>
    {error && <p className="diff-open-error" role="alert">{error}</p>}
    <MotionDisclosure id={contentId} open={!collapsed} unmountWhenClosed>{()=>file.binary ? <p className="empty-copy">Binary file. Text comparison is unavailable.</p> : <>
      {(comparison.approximate || comparison.truncated || comparison.rows.length > 3000) && <p className="diff-notice">{comparison.approximate?'Large comparison: line counts are approximate. ':''}{comparison.truncated||comparison.rows.length>3000?'Showing the first 3,000 rows. Open in your editor for the full contents.':''}</p>}
      <div className="diff-code" tabIndex={0} aria-label={`File diff for ${file.path}`}>{comparison.rows.slice(0,3000).map((row,i)=><div className={`code-line ${row.kind}`} key={i}><span className="line-number">{row.oldLine ?? ''}</span><span className="line-number">{row.newLine ?? ''}</span><span className="line-sign">{row.kind==='added'?'+':row.kind==='removed'?'−':' '}</span><code>{row.text.replace(/\r$/,'')||' '}{row.noNewline&&<small className="no-newline"> No newline at end of file</small>}</code></div>)}</div>
    </>}</MotionDisclosure>
  </section>;
}

export function ShellCommands({ results }: { results: ShellResult[] }) {
  if (!results.length) return null;
  return <section className="shell-commands" aria-label="Muse command results"><div className="shell-commands-heading"><Terminal size={15} /><strong>Muse commands</strong><span>{results.length}</span></div><p className="shell-evidence-note">Native command results. Run Checks to attach evidence to the current revision.</p>{results.map(result => <details className={`shell-result ${result.terminalStatus === 'failed' || result.exitCode !== 0 ? 'shell-result-failed' : ''}`} key={`${result.runId}:${result.callId}`}><summary><span>PowerShell · {result.terminalStatus}</span><code>exit {result.exitCode}</code><ChevronDown size={13} /></summary><div className="shell-result-body"><span className="shell-field-label">Command</span><pre aria-label="Native command">{result.command || '(No command text reported)'}</pre><span className="shell-field-label">Output</span><pre aria-label="Native command output">{result.output || '(No output)'}</pre><p className="shell-result-meta">Native outcome: {result.outcome}{result.terminalReason ? ` · ${result.terminalReason}` : ''}</p>{result.truncated && <p className="shell-truncated">Command details or output were shortened.</p>}</div></details>)}</section>;
}

export function ProjectToolsPanel({ state, busy, act, stage, selectedFilePath, onDraft }: { state: AppState; busy: boolean; act: Act; stage: 'changes'|'preview'|'checks'; selectedFilePath?:string; onSelectFilePath?:(path:string)=>void;onDraft?:(key:string,text:string)=>void }) {
  const task = state.task, project = state.activeProject;
  const changesRef = useRef<HTMLDivElement>(null);
  const [previewScript, setPreviewScript] = useState('');
  const [checkScript, setCheckScript] = useState('');
  const [showPreviewLog, setShowPreviewLog] = useState(false);
  useEffect(() => {
    if (stage === 'changes' && selectedFilePath) {
      const file = [...(changesRef.current?.querySelectorAll<HTMLElement>('[data-file-path]') ?? [])].find(element => element.dataset.filePath === selectedFilePath);
      file?.scrollIntoView({block:'nearest'});
    }
  }, [stage, selectedFilePath, task?.id]);
  useEffect(() => {
    const scripts = Object.keys(project?.scripts ?? {});
    setPreviewScript(scripts.includes('dev') ? 'dev' : scripts.includes('start') ? 'start' : scripts[0] ?? '');
    setCheckScript(scripts.includes('test') ? 'test' : scripts.includes('check') ? 'check' : scripts.includes('build') ? 'build' : scripts[0] ?? '');
  }, [project?.id]);
  if (!task) return <section className="review-workspace"><div className="stage-empty"><Files size={24} /><h3>No active task</h3><p>Start a task to inspect its files, preview or checks.</p></div></section>;
  const scripts = Object.keys(project?.scripts ?? {});
  const passed = !task.check?.action && task.check?.status === 'passed' && task.check.revision === task.revision;
  return <section className="review-workspace"><div ref={changesRef} className={`stage-body ${stage === 'changes' ? 'changes-body' : ''}`}>
      {stage === 'changes' && (task.changes.length ? task.changes.map(file => <Diff key={`${task.id}:${file.path}`} taskId={task.id} file={file}/>) : <p className="empty-copy">No changes yet.</p>)}
      {stage === 'preview' && <><div className="section-heading"><div><p className="eyebrow">PREVIEW</p><h2>Project preview</h2><p>Run your project in a local preview.</p></div></div><div className="command-card"><label htmlFor="preview-script">Preview script</label><div className="command-controls"><select id="preview-script" value={previewScript} disabled={busy || state.preview.status === 'running' || !scripts.length} onChange={e => setPreviewScript(e.target.value)}>{!scripts.length && <option value="">No package scripts</option>}{scripts.map(script => <option key={script} value={script}>{script}</option>)}</select><button className={`button ${state.preview.status === 'running' ? '' : 'primary'}`} disabled={busy || !previewScript || state.preview.status === 'starting'} onClick={() => void act(state.preview.status === 'running' ? { type: 'stopPreview' } : { type: 'startPreview', script: previewScript })}>{state.preview.status === 'running' ? <><Square size={13} />Stop preview</> : state.preview.status === 'starting' ? <><LoaderCircle size={14} className="spin" />Starting…</> : <><Play size={14} />Start preview</>}</button></div><code>{project?.scripts[previewScript] ?? 'Add a preview script to package.json to continue.'}</code></div><div className="preview-frame">{state.preview.status!=='running'&&<div className="preview-browserbar"><span className="tiny-dot" /><span>{state.preview.url ?? 'Your local preview'}</span><button className="icon-button" aria-label="Toggle preview logs" onClick={() => setShowPreviewLog(!showPreviewLog)}><Terminal size={14} /></button></div>}{state.preview.status === 'running' && state.preview.url ? <ProjectPreview key={task.id+state.preview.url} projectId={task.projectId} taskId={task.id} url={state.preview.url} onDraft={(key,text)=>{if(!onDraft)throw Error('Open this preview from its chat to add feedback.');onDraft(key,text);}} logButton={<button className="icon-button" aria-label="Toggle preview logs" onClick={()=>setShowPreviewLog(!showPreviewLog)}><Terminal size={14}/></button>}/> : <div className="preview-placeholder"><Play size={29} /><h3>{state.preview.status === 'failed' ? 'Preview couldn’t start.' : state.preview.status === 'starting' ? 'Starting preview…' : 'Preview is stopped'}</h3><p>{state.preview.status === 'failed' ? 'Read the command output below, resolve the issue, and try again.' : 'Run a package script to view your local app here.'}</p></div>}</div>{(showPreviewLog || state.preview.status === 'failed') && <pre className="log-output" aria-label="Preview command output">{state.preview.log || 'No preview output yet.'}</pre>}</>}
      {stage === 'checks' && <><ProjectActions key={task.id} state={state} busy={busy} act={act}/><ValidationPanel task={task} project={project} busy={busy} act={act}/><div className="section-heading"><div><p className="eyebrow">CHECKS</p><h2>Project checks</h2><p>Run a script and inspect the output for this revision.</p></div><span className={`pill ${passed ? 'green' : task.check?.status === 'failed' ? 'red' : ''}`}>{task.check?.status === 'running' ? <LoaderCircle className="spin" size={13} /> : passed ? <Check size={13} /> : <Circle size={11} />}{task.check ? (task.check.action ? 'Action · '+task.check.status : task.check.revision !== task.revision ? 'Stale evidence' : task.check.status) : 'Not run'}</span></div><div className="command-card"><label htmlFor="check-script">Project check</label><div className="command-controls"><select id="check-script" value={checkScript} onChange={e => setCheckScript(e.target.value)} disabled={busy || task.check?.status === 'running' || !scripts.length}>{!scripts.length && <option value="">No package scripts</option>}{scripts.map(script => <option key={script} value={script}>{script}</option>)}</select><button className="button primary" disabled={busy || !checkScript || task.check?.status === 'running'} onClick={() => void act({ type: 'runCheck', script: checkScript })}><Play size={14} />Run check</button>{task.check?.status === 'running' && <button className="button" onClick={() => void act({ type: 'cancelCheck' })}><Square size={13} />Cancel</button>}</div><code>{project?.scripts[checkScript] ?? 'Add a check script to package.json to continue.'}</code></div><div className="check-terminal"><div className="terminal-heading"><span><Terminal size={15} />{task.check?.action ? task.check.action.name+' · Action output' : 'Command output'}</span><span>{task.check ? `exit ${task.check.exitCode ?? '—'} · ${short(task.check.revision)}` : 'Waiting for a run'}</span></div><pre className="log-output">{task.check?.log || 'Your check output will appear here.\n\nChoose a script above to begin.'}</pre></div></>}
      </div></section>;
}


export function RuntimeDialog({ state, busy, act, close, onError }: { state: AppState; busy: boolean; act: Act; close: () => void; onError?: (message: string) => void }) {
  const [toolDiscovery,setToolDiscovery]=useState<DiscoverySelection>();
  const [discoveryBlocked,setDiscoveryBlocked]=useState(!!state.task?.nativeSession?.toolDiscovery);
  const discoveryChanged=(selection:DiscoverySelection|undefined,blocked:boolean)=>{setToolDiscovery(selection);setDiscoveryBlocked(blocked);};
  const [decisionPending, setDecisionPending] = useState(false);
  const [transport,setTransport]=useState<'exec'|'msp'>(state.runtime.transport??'exec');const [fullAccess, setFullAccess] = useState(state.runtime.fullAccess === true);
  useEffect(()=>setFullAccess(state.runtime.fullAccess === true),[state.runtime.fullAccess,state.runtime.sessionId]);
  const selectedTools=state.runtime.sessionId?state.runtime:(state.task?.nativeSession??state.runtime);
  const [workspaceTools,setWorkspaceTools]=useState(selectedTools.workspaceTools===true);
  const [workspaceToolset,setWorkspaceToolset]=useState<WorkspaceToolset>(selectedTools.workspaceToolset??'navigation-v1');
  useEffect(()=>{setWorkspaceTools(selectedTools.workspaceTools===true);setWorkspaceToolset(selectedTools.workspaceToolset??'navigation-v1');},[selectedTools.workspaceTools,selectedTools.workspaceToolset,state.runtime.sessionId,state.task?.id]);
  const [error, setError] = useState<string | null>(null);
  const reportError = (value: unknown) => { const message = value instanceof Error ? value.message : String(value); setError(message); onError?.(message); };
  const bridge = window.musebench;
  const project = state.activeProject;
  const [selectedRequest,setSelectedRequest]=useState('');
  const requests=state.runtime.pendingRequests??(state.runtime.pending?[state.runtime.pending as {kind:string;approvalId?:string;userInputId?:string}]:[]);
  const keyOf=(p:{kind:string;approvalId?:string;userInputId?:string})=>p.kind+':'+(p.approvalId??p.userInputId);
  const selected=requests.find(p=>keyOf(p)===selectedRequest)??requests[0];
  const permission = permissionDetails(selected, state.runtime);
  const selectedRuntime={...state.runtime,pending:selected,inputResponse:state.runtime.inputResponses?.find(r=>r.userInputId===selected?.userInputId)??state.runtime.inputResponse};
  const hasSession = Boolean(state.runtime.sessionId);
  const execMode = state.runtime.transport === 'exec';
  const shellEnabled = execMode && state.runtime.shellEnabled === true;
  const runtimeActive = ['running', 'starting', 'submitting', 'connecting', 'checking-permissions'].includes(state.runtime.status);
  const runtimeBlocked = ['blocked', 'uncertain', 'unavailable', 'closed', 'error', 'failed'].includes(state.runtime.status) || Boolean(state.runtime.pending);
  const runtimeConnected = !runtimeBlocked && (hasSession || state.runtime.status === 'connected' || state.runtime.status === 'ready');
  return <Modal title="Your Muse connection" close={close} className="runtime-dialog">{error && <p className="runtime-local-error" role="alert">{error}</p>}<p className="modal-intro">{state.runtime.simulation ? 'Browser preview: connection controls are simulated. No model or shell commands run.' : state.runtime.fullAccess ? execMode?'Full access is active. Commands run with your Windows account permissions. Your composer approval setting still applies; interactive approval requests stop the run.':'Interactive Full access: commands run with your Windows account permissions. Ask me approvals are reviewed here. Saved sessions reconnect to the same native conversation. Uncertain requests are never resent automatically.' : execMode ? shellEnabled ? 'Muse uses the official CLI for Code requests and sandboxed PowerShell commands using the approval setting in your composer. Requests needing interactive approval stop. Review the command results below the conversation, then run the separate preview and revision checks.' : 'Windows compatibility mode uses the official Muse CLI for file-editing requests with the sandbox enabled and the approval setting in your composer. Agent shell and web tools are unavailable for this connection. Requests needing interactive approval stop; run previews and checks through MuseBench.' : 'MuseBench uses the official Muse CLI and SDK. Connect a local installation when you are ready to work with Muse. Muse manages sign-in and permissions; actions needing approval wait for your decision.'}</p><div className="runtime-status-card"><span className={`status-dot ${runtimeConnected ? 'online' : ''}`} /><div><strong>{runtimeConnected ? runtimeActive ? 'Muse is working' : execMode ? 'Muse CLI is ready' : 'Muse is connected' : hasSession ? 'Muse needs attention' : ['connecting', 'checking-permissions'].includes(state.runtime.status) ? 'Checking Muse connection' : state.runtime.binary ? 'Muse connection unavailable' : 'Muse needs a local runtime'}</strong><p>{state.runtime.reason || state.runtime.status}</p></div></div>{state.runtime.interactiveAvailable&&<label>Connection<select aria-label="Connection transport" disabled={busy||hasSession||runtimeActive} value={transport} onChange={e=>{const value=e.target.value as 'exec'|'msp';setTransport(value);if(value==='msp')setFullAccess(true);}}><option value="exec">Native exec (default)</option><option value="msp">Interactive · Full access</option></select></label>}{(execMode||state.runtime.interactiveAvailable)&&<fieldset className="runtime-access" disabled={busy||hasSession||runtimeActive}><legend>Execution access</legend><label><input type="radio" name="execution-access" disabled={transport==='msp'} checked={!fullAccess} onChange={()=>setFullAccess(false)}/>Sandboxed (default)</label><label><input type="radio" name="execution-access" checked={fullAccess} onChange={()=>setFullAccess(true)}/>Full access</label><p>{fullAccess?'No filesystem or network sandbox. Commands can access files available to your Windows account. Approval settings remain separate.':'Commands stay inside the Muse sandbox.'} {hasSession?'Disconnect to change access.':'Applies to this connection only.'}</p></fieldset>}{transport==='msp'&&<fieldset className="runtime-access" disabled={busy||hasSession||runtimeActive}><legend>Workspace tools</legend><WorkspaceToolOptions enabled={workspaceTools} toolset={workspaceToolset} onEnabled={setWorkspaceTools} onToolset={setWorkspaceToolset}/></fieldset>}{transport==='msp'&&state.task&&state.activeProject&&<DiscoveryTools key={state.task.id+'/'+state.activeProject.root} taskId={state.task.id} root={state.activeProject.root} saved={state.task.nativeSession?.toolDiscovery} disabled={busy||hasSession||runtimeActive} authDisabled={busy||runtimeActive||Boolean(state.runtime.pending)||state.runtime.cleanup==='unconfirmed'} onChange={discoveryChanged}/>}<dl className="runtime-details">{state.runtime.restoration?.status==='restored'&&<div><dt>Native session</dt><dd>Restored - {state.runtime.restoration.turnCount??0} saved turns</dd></div>}{state.runtime.runLimits&&<div><dt>Current run limits</dt><dd>{state.runtime.runLimits.wallTimeMs/60000} min · {state.runtime.runLimits.steps} steps · No token cap</dd></div>}{project && <div><dt>Project folder</dt><dd>{project.root}</dd></div>}{execMode && <div><dt>Agent commands</dt><dd>{shellEnabled ? state.runtime.fullAccess ? 'PowerShell - Full access' : 'Sandboxed PowerShell' : 'Unavailable for this connection'}</dd></div>}<div><dt>Detected binary</dt><dd>{state.runtime.binary || 'No Muse executable detected'}</dd></div><div><dt>Connection mode</dt><dd>{execMode ? 'Windows compatibility · native exec' : 'Muse SDK'}</dd></div>{!execMode && <div><dt>SDK version</dt><dd>{state.runtime.sdkVersion || 'Unavailable'}</dd></div>}<div><dt>Runtime version</dt><dd>{state.runtime.hostVersion || 'Not connected'}</dd></div><div><dt>Model completion</dt><dd>{state.runtime.liveVerified ? 'Completed a real request' : 'Not yet verified'}</dd></div></dl><ConnectionDiagnostics runtime={state.runtime}/><RuntimeCapabilities runtime={state.runtime}/>{execMode && state.runtime.shellUnavailableReason && <div className="command-copy-notice"><div><FolderOpen size={18} /><strong>Use a command-compatible working copy</strong></div><p>{state.runtime.shellUnavailableReason}</p><p>Copies reviewed source files to a command-compatible folder. Dependencies, Git metadata and local secrets are excluded; your original stays unchanged. You may need to install dependencies.</p><button className="button" disabled={busy || runtimeActive || !project} onClick={async () => { const next = await act({ type: 'createCommandCopy' }); if (next && !next.error) { close(); } }}><Files size={15} />Create working copy</button></div>}{!state.runtime.binary && <div className="hint-row"><Info size={16} /><p>MuseBench does not include or install Muse CLI. Select your existing Muse executable, or follow the official setup documentation.</p></div>}{requests.length>1&&<label>Pending requests<select aria-label="Pending requests" value={selected?keyOf(selected):''} onChange={e=>setSelectedRequest(e.target.value)}>{requests.map((p,i)=><option key={keyOf(p)} value={keyOf(p)}>{p.kind==='input'?'Question':'Approval'} {i+1}</option>)}</select></label>}{permission.pending?.kind==='input'&&state.task&&<NativeQuestion runtime={selectedRuntime} taskId={state.task.id} busy={busy} act={act}/>}
{permission.pending?.kind==='approval' && <div className="pending-card"><strong>{permission.pending.kind === 'approval' ? 'Review this permission request.' : 'Muse requested additional input.'}</strong><p>{permission.pending.kind === 'approval' ? 'Only the current request can be approved here. MuseBench never grants persistent permissions.' : 'This input type cannot be answered here. Disconnect to close the session.'}</p>{permission.discovery && <dl className="permission-discovery" aria-label="Requested discovery identity"><div><dt>Source</dt><dd><code>{permission.discovery.sourceId}</code></dd></div><div><dt>Tool</dt><dd><code>{permission.discovery.tool}</code></dd></div></dl>}{permission.tool && <div className="permission-field"><span>Tool</span><code>{permission.tool}</code></div>}{permission.subject && <div className="permission-field"><span>Request</span><pre tabIndex={0} aria-label="Full request details">{permission.subject}</pre></div>}{permission.args && <div className="permission-field"><span>Arguments</span><pre tabIndex={0} aria-label="Full request arguments">{permission.args}</pre></div>}{!permission.approvalAllowed && <div id="permission-review-warning" className="permission-review-warning" role="alert"><ShieldCheck size={20} /><div><strong>{permission.truncated ? 'Request too large to review fully.' : 'Request details could not be displayed fully.'}</strong><p>{permission.truncated ? `A field exceeds the ${permission.limit.toLocaleString()} character review limit. The displayed details are incomplete.` : 'Some request details are unavailable.'} Approval is disabled. Deny this request or disconnect the session.</p></div></div>}{permission.choices.length > 0 ? <div className="permission-actions">{permission.choices.map(choice => <button key={choice.choiceId} className={`button ${choice.decision === 'approved' ? 'primary' : ''}`} disabled={decisionPending || (choice.decision === 'approved' && !permission.approvalAllowed)} aria-describedby={choice.decision === 'approved' && !permission.approvalAllowed ? 'permission-review-warning' : undefined} onClick={async () => { if (choice.decision === 'approved' && !permission.approvalAllowed) return; setDecisionPending(true); try { await act({ type: 'runtimeDecision', decision: choice.decisionToken }); } finally { setDecisionPending(false); } }}>{choice.decision === 'approved' ? <ShieldCheck size={15} /> : <X size={15} />}{choice.label || (choice.decision === 'approved' ? 'Allow once' : 'Deny request')}<span className="choice-scope">Once</span></button>)}</div> : <p className="permission-unavailable">No supported one-time choices are available. Disconnect to stop this session safely.</p>}</div>}<div className="modal-actions"><button className="button" disabled={busy || hasSession || transport==='msp'&&discoveryBlocked} onClick={async () => { try { const binary = await bridge?.chooseBinary(); if (binary) await act({ type: 'connectMuse', binary, fullAccess, transport, workspaceTools:transport==='msp'&&workspaceTools,...(transport==='msp'&&workspaceTools?{workspaceToolset}:{}),...(transport==='msp'&&toolDiscovery?{toolDiscovery}:{}) }); } catch (error) { reportError(error); } }}><FolderOpen size={15} />Choose executable</button><button className="button primary" disabled={decisionPending || (!hasSession && (busy || transport==='msp'&&discoveryBlocked || (!state.runtime.binary&&!state.runtime.simulation)))} onClick={() => void act(hasSession ? { type: 'disconnectMuse' } : { type: 'connectMuse', fullAccess, transport, workspaceTools:transport==='msp'&&workspaceTools,...(transport==='msp'&&workspaceTools?{workspaceToolset}:{}),...(transport==='msp'&&toolDiscovery?{toolDiscovery}:{}) })}>{busy ? <LoaderCircle className="spin" size={15} /> : hasSession ? <Square size={13} /> : <Play size={14} />}{hasSession ? 'Disconnect' : 'Connect Muse'}</button></div><button className="text-link docs-link" onClick={() => void bridge?.openExternal('https://dev.meta.ai/docs/muse-code').catch(error => reportError(error))}>Official Muse documentation<ExternalLink size={13} /></button></Modal>;
}

export function CheckpointDialog({ state, close, act }: { state: AppState; close: () => void; act:Act }) {
 const [selected,setSelected]=useState(''),[comparison,setComparison]=useState<import('../shared/types').CheckpointComparison|null>(null),[paths,setPaths]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const inspect=async(id:string)=>{setSelected(id);setPaths([]);setComparison(null);setLoading(true);setError('');try{setComparison(await window.musebench!.inspectCheckpoint({taskId:state.task!.id,id}));}catch(e){setError(String(e));}finally{setLoading(false);}};
 return <Modal title="Local checkpoints" close={close} className="checkpoint-dialog"><p className="modal-intro">Restore selected text files. A Before restore checkpoint preserves redo. Conversation and Git staging stay unchanged.</p>
 {state.checkpoints.filter(c=>c.taskId===state.task?.id).map(c=><button className="button" aria-label={c.title} key={c.id} disabled={loading||state.busy} onClick={()=>void inspect(c.id)}>{c.title} · {short(c.revision)} · {when(c.createdAt)}</button>)}
 {!state.checkpoints.some(c=>c.taskId===state.task?.id)&&<p>No checkpoints in this chat yet.</p>}{error&&<p role="alert">{error}</p>}{comparison&&<>
 {comparison.operations.some(op=>op.status!=='completed')&&<p role="alert">A restore was interrupted. Inspect current files and the Before restore checkpoint before retrying.</p>}
 {!comparison.files.length&&<p>These files already match the checkpoint.</p>}{comparison.files.map(file=><div key={file.path}><label><input type="checkbox" disabled={!file.restorable||state.busy} checked={paths.includes(file.path)} onChange={e=>setPaths(e.target.checked?[...paths,file.path]:paths.filter(p=>p!==file.path))}/>{file.path} {!file.restorable&&'— binary capture unavailable'}</label><Diff file={file} taskId={state.task!.id}/></div>)}
 <div className="modal-actions"><button className="button" disabled={state.busy} onClick={()=>void inspect(selected)}>Refresh comparison</button><button className="button primary" disabled={!paths.length||state.busy||loading} onClick={async()=>{setLoading(true);try{const result=await act({type:'restoreCheckpoint',taskId:state.task!.id,id:selected,revision:comparison.revision,paths});if(result?.error)setError(result.error);else await inspect(selected);}finally{setLoading(false);}}}>Restore {paths.length} selected files</button></div></>}
 </Modal>;
}
