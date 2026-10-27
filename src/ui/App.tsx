import {WorkflowLibrary} from './WorkflowLibrary';
import {ContextHandoff} from './ContextHandoff';
import {SessionDialog} from './SessionDialog';
import {WorktreeDialog} from './WorktreeDialog';
import {CodeImages,useImageUploads} from './CodeImages';
import {PromptQueue} from './PromptQueue';
import {CreateProject} from './CreateProject';
import {SidebarChrome} from './SidebarChrome';
import {ChatFind} from './ChatFind';
import {CustomizeIcon} from './CustomizeIcon';
import {NavigationButtons,NavigationHistoryContext,useNavigationHistory} from './NavigationHistory';
import {ResponseActions} from './ResponseActions';
import {ChatSidebar} from './ChatSidebar';
import {CompactNavigation,codeDestinations,type CodeDestination} from './CompactNavigation';
import {CodeDestinations} from './CodeDestinations';
import {useCodeDraft} from './useCodeDraft';
import {CodeContext} from './CodeContext';
import {ChatLibrary} from './ChatLibrary';
import {customizeBlocked} from '../shared/customize-policy.mjs';
import {CustomizeDialog} from './CustomizeDialog';
import type {CustomizeTab} from '../shared/customize-types';
import {RunActivity,WorkThreads,ChangedFiles} from './WorkActivity';
import {CommandDialog,type CommandView} from './CommandDialog';
import {findCommand,parseSlashSubmission,type MuseSkill} from '../shared/slash-commands.mjs';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Archive, Pin, ArrowDown, ArrowUp, Bot, ChevronDown, ChevronRight, Code2, Copy, Files, FolderOpen, History, Home, Info, Keyboard, Lightbulb, LoaderCircle, MessageSquare, PanelLeft, Plus, Search, Settings2, ShieldCheck, Square, SquarePen, Target, Terminal, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Action, AppState, PersonalCommand, PersonalDestination } from '../shared/types';
import { CheckpointDialog, Modal, ProjectToolsPanel, RuntimeDialog, ShellCommands } from './WorkspacePanels';
import { SettingsDialog, usePreferences } from './Preferences.tsx';
import { resolveTheme } from './preferences.mjs';
import { PersonalNavigation, PersonalWorkspace, ProductSwitcher, usePersonalBrowser } from './PersonalMuse';
import {ChatComposer} from './ChatComposer';
import {PromptTimeline} from './PromptTimeline';
import {restoreRunOptions} from '../shared/run-options.mjs';
import type {RunOptions} from '../shared/types';
import { ProjectOverview } from './ProjectOverview';
import {ProfileMenu,type ProfileAction} from './ProfileMenu';
import {ProfilePage} from './ProfilePage';
import {useLocalProfile} from './useLocalProfile';
import {useWork,WorkSidebar,WorkWorkspace} from './WorkWorkspace';
import {useSpaces,SpacesSidebar,SpacesWorkspace} from './SpacesWorkspace';
import {useSites,SitesSidebar,SitesWorkspace} from './SitesWorkspace';
import './work-mode.css';
export { ShellCommands } from './WorkspacePanels';

const starters = [
  { title: 'Find and fix a bug', description: 'Trace the cause, make a focused fix, and verify it.', icon: Code2, prompt: 'Investigate a bug in this project. Explain the likely cause, make a focused fix, and run the relevant tests.' },
  { title: 'Understand this project', description: 'Explore the architecture and the important entry points.', icon: FolderOpen, prompt: 'Explain how this project is organized. Identify its main entry points, architecture, and the commands used to develop and test it. Do not change files.' },
  { title: 'Review my changes', description: 'Look for bugs, regressions, and missing coverage.', icon: Files, prompt: 'Review the current project changes for correctness, regressions, and missing tests. Give specific findings with file references and explain their impact before proposing edits.' },
  { title: 'Add useful tests', description: 'Cover a real behavior and its edge cases.', icon: ShieldCheck, prompt: 'Inspect the existing tests, identify an important behavior with missing coverage, and add focused tests. Run the relevant project command.' },
];
const activeStatuses = ['running', 'starting', 'submitting', 'connecting', 'checking-permissions'];


function CodeBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timer); } }, [copied]);
  return <div className="markdown-code"><div><span>Code</span><button onClick={async () => { try { await navigator.clipboard.writeText(ref.current?.innerText ?? ''); setCopied(true); } catch { /* Code also supports manual selection. */ } }}><Copy size={12} />{copied ? 'Copied' : 'Copy code'}</button></div><pre ref={ref}>{children}</pre></div>;
}
function MarkdownText({ text }: { text: string }) {
  return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <span className="message-link" title={href}>{children}</span>, img: ({ alt }) => <span className="muted">{alt || 'Image reference'}</span>, pre: ({ children }) => <CodeBlock>{children}</CodeBlock> }}>{text}</Markdown></div>;
}

type AppVisit =
 | {area:'code';view:'chat'|'project'|'customize'|'profile'|CodeDestination;projectId?:string;taskId?:string;creating?:boolean}
 | {area:'spaces';product:'code'|'personal';home:boolean;id?:string;pageId?:string}
 | {area:'sites';product:'code'|'personal';home:boolean;id?:string}
 | {area:'work';home:boolean;id?:string}
 | {area:'personal';destination:PersonalDestination;id?:string};

export default function App() {
  const bridge = window.musebench;
  const [state, setState] = useState<AppState | null>(null);
  const [preferences, setPreferences] = usePreferences();
  const [product, setProduct] = useState<'code' | 'personal'>('code');
  const [view, setView] = useState<'chat' | 'project' | 'customize' | 'profile' | CodeDestination>('chat');
  const [personalMode,setPersonalMode]=useState<'chat'|'work'>('chat');
  const [workHome,setWorkHome]=useState(true);
  const [spacesVisible,setSpacesVisible]=useState(false);
  const [spacesHome,setSpacesHome]=useState(true);
  const [sitesVisible,setSitesVisible]=useState(false);
  const [sitesHome,setSitesHome]=useState(true);
  const codeSites=product==='code'&&view==='sites',codeSpaces=product==='code'&&view==='spaces';
  const {state:sitesState,command:sitesCommand,importFolder,connect:connectHosting,pollAuth}=useSites(codeSites||(product==='personal'&&personalMode==='work'&&sitesVisible));
  const {state:spacesState,command:spacesCommand}=useSpaces(codeSpaces||(product==='personal'&&personalMode==='work'&&spacesVisible&&!sitesVisible));
  const {state:workState,command:workCommand,importSources,exportArtifact}=useWork();
  const [profileMenuOpen,setProfileMenuOpen]=useState(false);
  const [personalSearchOpen,setPersonalSearchOpen]=useState(false);
  const [threadsOpen,setThreadsOpen]=useState(false);
  const [selectedRunId,setSelectedRunId]=useState<string>();
  const [selectedFilePath,setSelectedFilePath]=useState<string>();
  const { state: personalState, command: personalCommand } = usePersonalBrowser();
  const lastPersonalAppearance = useRef('');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncAppearance = () => {
      const appearance = { theme: resolveTheme(preferences.theme, media.matches), textSize: preferences.textSize, font: preferences.font, reducedMotion: preferences.reducedMotion };
      const signature = JSON.stringify(appearance);
      if (signature === lastPersonalAppearance.current) return;
      lastPersonalAppearance.current = signature;
      void personalCommand({ type: 'appearance', appearance });
    };
    syncAppearance(); media.addEventListener('change', syncAppearance);
    return () => media.removeEventListener('change', syncAppearance);
  }, [personalCommand, preferences.theme, preferences.textSize, preferences.font, preferences.reducedMotion]);
  const personalDestination = personalState?.destination ?? 'chat';
  const selectProduct = (next: 'code' | 'personal') => { setProduct(next); setMobileNav(false); requestAnimationFrame(()=>{const target=document.querySelector<HTMLButtonElement>('.sidebar:not([hidden]) .product-mode-switch [aria-pressed="true"]');if(target?.checkVisibility())target.focus({preventScroll:true});}); };
  const navigatePersonal = (destination: PersonalDestination) => { setProduct('personal'); setPersonalMode('chat'); setMobileNav(false); void personalCommand({ type: 'navigate', destination }); };
  const workModeSwitch=<div className="work-mode-switch" role="group" aria-label="Chat or Work"><button type="button" aria-label="Chat" title="Meta AI chat" aria-pressed={personalMode==='chat'} onClick={()=>navigatePersonal('chat')}><MessageSquare size={14}/><span>Chat</span></button><button type="button" aria-label="Work" title="Documents, spreadsheets, and presentations" aria-pressed={personalMode==='work'} onClick={()=>setPersonalMode('work')}><Files size={14}/><span>Work</span></button></div>;
  const [modal, setModal] = useState<'workflows' | 'handoff' | 'session' | 'worktrees' | 'create-project' | 'runtime' | 'settings' | 'search' | 'history' | 'command' | 'extensions' | 'context' | null>(null);
  const [commandView,setCommandView]=useState<CommandView>({id:'help'});
  const [skills,setSkills]=useState<MuseSkill[]>([]),[skillsStatus,setSkillsStatus]=useState('idle');
  const skillsKey=useRef(''),skillsGeneration=useRef(0);
  const profileReturn=useRef({product,view});
  const {profile:accountProfile,save:saveProfile}=useLocalProfile(personalState?.profile);
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState<'changes'|'preview'|'checks'>('changes');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewWidth, setReviewWidth] = useState(460);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(()=>{setProfileMenuOpen(false);},[modal,product,preferences.sidebarCollapsed,mobileNav]);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 700px)');
    const closeDesktopOverlay = () => { if (!narrow.matches) setMobileNav(false); };
    narrow.addEventListener('change', closeDesktopOverlay);
    return () => narrow.removeEventListener('change', closeDesktopOverlay);
  }, []);
  const [draftOptions,setDraftOptions] = useState<RunOptions>(()=>({reasoning:preferences.defaultReasoning,approval:preferences.defaultApproval}));
  useEffect(()=>{setDraftOptions({reasoning:preferences.defaultReasoning,approval:preferences.defaultApproval});},[preferences.defaultReasoning,preferences.defaultApproval]);
  const [mode, setMode] = useState<'muse' | 'manual'>('muse');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [scrolledUp, setScrolledUp] = useState(false);
  const personalFilter = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null), transcript = useRef<HTMLDivElement>(null);
  const draftForTask = useRef(''),submitting=useRef(false);
  const composerShell=useRef<HTMLDivElement>(null),composerOrigin=useRef<DOMRect|null>(null);
  useLayoutEffect(()=>{
    if(view!=='chat'||!composerOrigin.current||!composerShell.current)return;
    const from=composerOrigin.current;composerOrigin.current=null;
    const element=composerShell.current,to=element.getBoundingClientRect();
    if(!preferences.reducedMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&from.width&&to.width){
      element.animate([{transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`},{transform:'none'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
    }
    composer.current?.focus({preventScroll:true});
  },[view,preferences.reducedMotion]);
  const task = state?.task, project = state?.activeProject;
  const showTask = Boolean(task && !creating && view!=='project'), busy = pending || Boolean(state?.busy);
  const selectedRuntimeActive = activeStatuses.includes(state?.runtime.status ?? '');
  const runtimeActive=selectedRuntimeActive&&(!state?.backgroundChats||showTask);
  const navigationBusy=busy||selectedRuntimeActive&&!state?.backgroundChats;
  const {images:codeImages,setImages:setCodeImages,message,setMessage,files:contextFiles,setFiles:setContextFiles,messageMode,setMessageMode,setDraftFor}=useCodeDraft(bridge,project?.id,showTask?task!.id:null,state?.drafts,setLocalError);
  const hasSession = Boolean(state?.runtime.sessionId);
  const runtimeBlocked = ['blocked', 'uncertain', 'unavailable', 'closed', 'error', 'failed'].includes(state?.runtime.status ?? '') || Boolean(state?.runtime.pending);
  const connected = !runtimeBlocked && (hasSession || state?.runtime.status === 'connected' || state?.runtime.status === 'ready');
  const canSend = Boolean(showTask && !busy && !runtimeActive && !state?.runtime.pending&&!state?.runtime.operationBusy&&!task?.archived);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge.getState().then(value => { if (active) setState(value); }).catch(error => setLocalError(String(error)));
    const dispose = bridge.onState(value => { if (active) setState(value); });
    return () => { active = false; dispose(); };
  }, [bridge]);
  const act = useCallback(async (action: Action) => {
    if (!bridge) return null;
    setPending(true);
    try { const next = await bridge.dispatch(action); setState(next); return next; }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); return null; }
    finally { setPending(false); }
  }, [bridge]);
  const [customizeQuery,setCustomizeQuery]=useState(''),[shortcutRevision,setShortcutRevision]=useState(0);
  const [customizeTab,setCustomizeTab]=useState<CustomizeTab>('skills');
  const openCustomize=(tab:CustomizeTab='skills',filter='')=>{setCustomizeQuery(filter);setCustomizeTab(tab);setProfileMenuOpen(false);setMobileNav(false);setModal('extensions');};
  const closeModal = useCallback(() => setModal(null), []);
  const openSearch = () => { setQuery(''); setModal('search'); setMobileNav(false); };
  const focusPersonalFilter = () => {
    setProduct('personal');
    setPersonalSearchOpen(true);
    setPreferences(current => ({ ...current, sidebarCollapsed: false }));
    setMobileNav(window.matchMedia('(max-width: 700px)').matches);
    requestAnimationFrame(() => { if(personalMode==='work')document.querySelector<HTMLInputElement>('.personal-sidebar .work-sidebar-search input')?.focus();else personalFilter.current?.focus(); });
  };
  const personalSidebarCommand = (request: PersonalCommand) => {
    if (request.type === 'selectItem' || request.type === 'newMuseChat' || request.type==='metaAction') setMobileNav(false);
    void personalCommand(request);
  };
  const beginNewChat = (initial?:string) => { if (navigationBusy) return; if(initial!==undefined){if(project)setDraftFor(project.id,null,{text:initial,files:[],mode:'chat'});else setMessage(initial);} setProduct('code'); setCreating(true); setView('chat'); setReviewOpen(false); setDraftOptions({reasoning:preferences.defaultReasoning,approval:preferences.defaultApproval}); setMobileNav(false); setModal(null); setTimeout(() => composer.current?.focus(), 0); };
  const newChat=()=>beginNewChat();
  const toggleSidebar = () => { if(mobileNav){setMobileNav(false);return;} setPreferences(p => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed })); };
  const revealSidebar = () => { setPreferences(p => ({ ...p, sidebarCollapsed: false })); setMobileNav(window.matchMedia('(max-width: 700px)').matches); };
  const openFolder = async (destination: 'chat' | 'project' = 'project') => {
    if (navigationBusy) return;
    const keepCreating = destination === 'chat' && (creating || !task);
    const draft = message;
    try {
      const selected = await bridge?.chooseProject();
      if (selected) {
        if (keepCreating) draftForTask.current = draft;
        const next = await act({ type: 'openProject', path: selected });
        if (next && !next.error) {
          setCreating(keepCreating || !next.task); setView(destination); setReviewOpen(false); setMobileNav(false);
          if (keepCreating&&next.activeProject) setDraftFor(next.activeProject.id,null,{text:draft,files:[],mode:messageMode});
          if (next.task?.id === task?.id) draftForTask.current = '';
        } else draftForTask.current = '';
      }
    }
    catch (error) { setLocalError(String(error)); }
  };
  const navigateTask = async (id: string) => {
    if (navigationBusy) return;
    const next = await act({ type: 'selectTask', id });
    if (next && !next.error) { setProduct('code'); setCreating(false); setView('chat'); setReviewOpen(false); setModal(null); setMobileNav(false); }
  };
  const navigateProject = async (id: string) => {
    if (navigationBusy) return;
    // Visiting the current project is view navigation only, preserving its selected chat and drafts.
    const next = id === project?.id ? state : await act({ type: 'selectProject', id });
    if (next && !next.error) { setProduct('code'); if (id !== project?.id) setCreating(!next.task); setView('project'); setReviewOpen(false); setModal(null); setMobileNav(false); }
  };
  const newProjectChat = async (id: string) => {
    if (navigationBusy) return;
    const next = id === project?.id ? state : await act({ type: 'selectProject', id });
    if (next && !next.error) { newChat(); }
  };
  const useStarter = (prompt: string) => { if (busy || runtimeActive) return; beginNewChat(prompt); };
  useEffect(() => { setStage('changes'); setReviewOpen(false); setThreadsOpen(false);setSelectedRunId(undefined);setSelectedFilePath(undefined); draftForTask.current = ''; setScrolledUp(false); }, [task?.id]);
  useEffect(() => { if (transcript.current && !scrolledUp) transcript.current.scrollTop = transcript.current.scrollHeight; }, [task?.messages, task?.shellResults, runtimeActive, scrolledUp, task?.id]);
  useEffect(() => { const element = composer.current; if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 180)}px`; } }, [message, creating]);
  useEffect(() => {
    if (!bridge || !task || busy) return;
    let active = true, refreshing = false;
    const refresh = async () => { if (refreshing) return; refreshing = true; try { const next = await bridge.dispatch({ type: 'refresh' }); if (active) setState(next); } catch (error) { if (active) setLocalError(String(error)); } finally { refreshing = false; } };
    window.addEventListener('focus', refresh); const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [bridge, task?.id, busy, runtimeActive]);
  const lastRuntimeStatus=useRef('');
  useEffect(()=>{const previous=lastRuntimeStatus.current;lastRuntimeStatus.current=state?.runtime.status??'';if(bridge&&task&&activeStatuses.includes(previous)&&!runtimeActive)void act({type:'refresh'});},[state?.runtime.status,task?.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const letter = event.key.toLowerCase();
      if (letter === 'k') { event.preventDefault(); if(product==='personal'&&personalMode==='chat'&&personalDestination==='chat'&&!modal)personalSidebarCommand({type:'metaAction',action:'search'});else if (product === 'personal' && !modal) focusPersonalFilter(); else openSearch(); }
      else if (letter === ',') { event.preventDefault(); setModal('settings'); }
      else if (letter === 'b') { event.preventDefault(); toggleSidebar(); }
      else if (letter === 'n' && !modal) { event.preventDefault(); if(product==='personal'&&personalMode==='work'){setSitesVisible(false);setSpacesVisible(false);setWorkHome(true);setMobileNav(false);}else if (product === 'personal') personalSidebarCommand(personalDestination==='chat'?{type:'metaAction',action:'newChat'}:{type:'newMuseChat'}); else newChat(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [busy, runtimeActive, modal, mobileNav, setPreferences, product, personalMode, personalDestination, personalCommand, project?.id]);
  useEffect(() => bridge?.onPersonalShortcut?.(shortcut => {
    if (shortcut === 'code') { setProduct('code'); setView('project'); setCreating(false); setReviewOpen(false); setModal(null); setMobileNav(false); }
    else if (shortcut === 'k' && !modal) focusPersonalFilter();
    else if (shortcut === ',') setModal('settings');
    else if (shortcut === 'b') setPreferences(p => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed }));
    else if (shortcut === 'n' && !modal) personalSidebarCommand(personalDestination==='chat'?{type:'metaAction',action:'newChat'}:{type:'newMuseChat'});
  }), [bridge, personalCommand, personalDestination, modal, setPreferences]);
  const showCommand=(id:string,args='',detail='')=>{setCommandView({id,args,detail});setModal('command');};
  const loadSkills=()=>{
    const key=`${project?.id??''}:${state?.runtime.binary??''}`;
    if(skillsKey.current===key)return;
    skillsKey.current=key;const generation=++skillsGeneration.current;setSkillsStatus('loading');
    void bridge?.commandInfo('skills').then(result=>{if(skillsGeneration.current!==generation)return;if(result.status!=='ready')skillsKey.current='';setSkills(result.skills??[]);setSkillsStatus(result.status);}).catch(()=>{if(skillsGeneration.current===generation){skillsKey.current='';setSkills([]);setSkillsStatus('unavailable');}});
  };
  useEffect(()=>{skillsKey.current='';skillsGeneration.current++;setSkills([]);setSkillsStatus('idle');},[project?.id,state?.runtime.binary]);
  const applyOptions=(options:RunOptions)=>{if(showTask)void act({type:'setRunOptions',runOptions:options});else setDraftOptions(options);};
  const commandDraft=(text:string,fresh=false)=>{setModal(null);if(fresh)beginNewChat(text);else setMessage(text);requestAnimationFrame(()=>composer.current?.focus());};
  const command=async(id:string,args:string,prefix:string)=>{
    if(id==='session'&&task&&!busy){setModal('session');return;}
    if(busy||runtimeActive)return;
    const options=showTask?restoreRunOptions(task?.runOptions):draftOptions;
    const entry=findCommand(id);
    if(id==='unknown'){showCommand(id,args);return;}
    setMessage(prefix);
    if(id==='session'){if(task)setModal('session');return;}
    if(id==='worktree'){if(project)setModal('worktrees');else void openFolder('chat');return;}
    if(id==='mcp'||id==='plugins'||id==='customize'){openCustomize(id==='mcp'?'mcp':id==='plugins'?'plugins':'skills');return;}
    if(entry?.kind==='info'){showCommand(id,args,entry.detail);return;}
    if(id==='fast'){applyOptions({...options,reasoning:args==='on'?'low':args==='off'?'high':options.reasoning==='low'?'high':'low'});return;}
    if(id==='goal'&&showTask&&['pause','resume','clear'].includes(args)){
      if(task?.goal)await act({type:'setGoal',objective:args==='clear'?'':task.goal.objective,status:args==='pause'?'paused':'active'});
      else showCommand('goal');return;
    }
    if(id==='reasoning'){
      if(['none','minimal','low','medium','high','xhigh','max','ultra'].includes(args)){applyOptions({...options,reasoning:args as RunOptions['reasoning']});return;}
      setMessage([prefix,'/reasoning'].filter(Boolean).join('\n'));return;
    }
    if(id==='approval'){
      if(['ask','auto','never'].includes(args)){applyOptions({...options,approval:args as RunOptions['approval']});return;}
      setMessage([prefix,'/approval'].filter(Boolean).join('\n'));return;
    }
    if(id==='theme'){if(['system','light','dark'].includes(args))setPreferences(value=>({...value,theme:args as 'system'|'light'|'dark'}));else setMessage([prefix,'/theme'].filter(Boolean).join('\n'));return;}
    if(id==='plan'){setMessageMode(args==='off'?'chat':args?'plan':messageMode==='plan'?'chat':'plan');if(args&&!['on','off'].includes(args))setMessage([prefix,args].filter(Boolean).join('\n'));return;}
    if(id==='model'){showCommand('model','',`Active model: ${state?.runtime.modelId??'Muse provider default'}. This validated Muse connection uses the provider default. Use /reasoning to adjust effort; Codex and Claude models are not available through Muse CLI.`);return;}
    if(id==='new'){beginNewChat(prefix||args?[prefix,args].filter(Boolean).join('\n'):undefined);return;}
    if(id==='resume'){openSearch();setQuery(args);return;}
    if(id==='context'){if(project)setModal('context');else await openFolder('chat');return;}
    if(id==='settings'){setModal('settings');return;}
    if(id==='workflows'){setModal('workflows');return;}
    if(id==='handoff'){setModal('handoff');return;}
    if(id==='connect'){setModal('runtime');return;}
    if(id==='disconnect'||id==='stop'){await act({type:'disconnectMuse'});return;}
    if(id==='project'){await openFolder('chat');return;}
    if(id==='tasks'){setView('project');return;}
    if(id==='checkpoints'){setModal('history');return;}
    if(['review','preview','checks'].includes(id)){if(!showTask){showCommand('status');return;}setReviewOpen(true);setStage(id==='review'?'changes':id as 'preview'|'checks');return;}
    if(['copy','export'].includes(id)&&!showTask){showCommand(id,'','Open a saved chat first to use this command.');return;}
    if(id==='copy'){const text=task?.messages.slice().reverse().find(m=>m.role==='assistant')?.text;if(text)await navigator.clipboard.writeText(text).catch(()=>setLocalError('Could not copy this response.'));else showCommand('copy','','This chat does not have a Muse response to copy yet.');return;}
    if(id==='export'||id==='mention'||id==='exit'){
      try{const result=await bridge!.commandInfo(id==='exit'?'close':id);if(id==='mention'&&result.path)setMessage([prefix,`Please look at this file: ${result.path}`].filter(Boolean).join('\n'));}catch(error){setLocalError(String(error));}return;
    }
    if(id==='recap'){
      const context=showTask&&task?[task.request,...task.messages.filter(m=>m.role!=='system').slice(-8).map(m=>`${m.role}: ${m.text}`)].join('\n\n').slice(-6000):'';
      setMessage(`Summarize this conversation: preserve the objective, decisions, changes and remaining work. Do not change files.\n\n${context}\n\n${[prefix,args].filter(Boolean).join('\n')}`);return;
    }
    if(id==='init'){setMessage(`Inspect this project and propose an AGENTS.md with its build/test commands and coding conventions. Preserve existing instructions.\n\n${[prefix,args].filter(Boolean).join('\n')}`);return;}
    if(id==='skills'){setMessage([prefix,'/skills'].filter(Boolean).join('\n'));return;}
    showCommand(id,args);
  };
  const imageUploads=useImageUploads(bridge,project?.id,showTask?task!.id:null,codeImages,setCodeImages,setLocalError);
  const queueMessage = async () => {
    const text=message.trim();if(!text||busy||imageUploads.uploading||!showTask||task?.mode!=='muse'||task.archived)return;
    const next=await act({type:'queueMessage',text,images:codeImages,files:contextFiles,mode:messageMode,runOptions:restoreRunOptions(task.runOptions)});
    if(next&&!next.error){setMessage('');setContextFiles([]);setCodeImages([]);}
  };
  const submitMessage = async () => {
    const text = message.trim(); if (!text || busy || runtimeActive&&!showTask) return;
    if(runtimeActive&&showTask&&task?.mode==='muse'){if(state?.runtime.steeringSupported&&state.runtime.turnId&&!codeImages.length&&!contextFiles.length){const next=await act({type:'steerMessage',taskId:task.id,expectedTurnId:state.runtime.turnId,text});if(next&&!next.error)setMessage('');}else await queueMessage();return;}
    const slash=parseSlashSubmission(text);if(slash){const entry=findCommand(slash.name);void command(entry?.id??'unknown',entry?slash.args:slash.name,slash.prefix);return;}
    if (!showTask || task?.mode === 'demo') {
      if (!project) { await openFolder('chat'); return; }
      const chatMode = showTask && task?.mode === 'demo' ? 'muse' : mode;
      draftForTask.current = chatMode === 'muse' ? text : '';
      const next = await act({ type: 'newTask', request: text, mode: chatMode, runOptions: showTask ? restoreRunOptions(task?.runOptions) : draftOptions });
      if (next && !next.error) {
        if(next.activeProject){setDraftFor(next.activeProject.id,null,{text:'',files:[],mode:'chat'});if(next.task)setDraftFor(next.activeProject.id,next.task.id,{text:chatMode==='muse'?text:'',files:chatMode==='muse'?contextFiles:[],images:chatMode==='muse'?codeImages:[],mode:messageMode});}
        if(view==='project')composerOrigin.current=composerShell.current?.getBoundingClientRect()??null;
        setCreating(false); setView('chat'); setStage('changes'); setReviewOpen(false);
        if (chatMode === 'muse') {
          const sent = await act({ type: 'sendMessage', text, mode: messageMode, images:codeImages, files:contextFiles });
          if (sent && !sent.error) { draftForTask.current = ''; if(next.task&&next.activeProject)setDraftFor(next.activeProject.id,next.task.id,{text:'',files:[],mode:'chat'}); }
        }
      } else draftForTask.current = '';
    } else if (canSend) { const next = await act({ type: 'sendMessage', text, mode: messageMode, images:codeImages, files:contextFiles }); if (next && !next.error) {setMessage('');setContextFiles([]);setCodeImages([]);} }
  };
  const submit=async()=>{if(submitting.current||imageUploads.uploading)return;submitting.current=true;try{await submitMessage();}finally{submitting.current=false;}};
  const currentVisit:AppVisit = codeSpaces||(product==='personal'&&personalMode==='work'&&spacesVisible&&!sitesVisible)
    ? {area:'spaces',product,home:spacesHome,...(!spacesHome?{id:spacesState?.activeId??undefined,pageId:spacesState?.page?.id}: {})}
    : codeSites||(product==='personal'&&personalMode==='work'&&sitesVisible)
    ? {area:'sites',product,home:sitesHome,...(!sitesHome?{id:sitesState?.activeId??undefined}: {})}
    : product==='personal'&&personalMode==='work'
    ? {area:'work',home:workHome,...(!workHome?{id:workState?.activeId??undefined}: {})}
    : product==='personal'
    ? {area:'personal',destination:personalDestination,id:personalState?.library.selectedId??undefined}
    : {area:'code',view,...(view==='chat'||view==='project'?{projectId:project?.id,taskId:creating?undefined:task?.id,creating}: {})};
  const historyBusy=busy||runtimeActive||Boolean(workState?.busy||sitesState?.busy||sitesState?.generation?.busy||spacesState?.busy);
  const navigationHistory=useNavigationHistory({route:state?JSON.stringify(currentVisit):null,ready:Boolean(state)&&!historyBusy&&!(product==='personal'&&personalMode==='chat'&&personalState?.loading),blocked:historyBusy||Boolean(modal),
    available:serialized=>{const target=JSON.parse(serialized) as AppVisit;
      if(target.area==='code')return (!target.projectId||Boolean(state?.projects.some(p=>p.id===target.projectId)))&&(!target.taskId||Boolean(state?.tasks.some(t=>t.id===target.taskId)));
      if(target.area==='work')return !target.id||Boolean(workState?.items.some(item=>item.id===target.id));
      if(target.area==='sites')return !target.id||Boolean(sitesState?.items.some(item=>item.id===target.id));
      if(target.area==='spaces')return !target.id||Boolean(spacesState?.spaces.some(item=>item.id===target.id));
      return true;
    },
    restore:async serialized=>{const target=JSON.parse(serialized) as AppVisit;
      if(target.area==='code'){
        if(target.taskId&&target.taskId!==task?.id){const next=await act({type:'selectTask',id:target.taskId});if(!next||next.error)throw Error(next?.error||'Could not reopen that chat.');}
        else if(target.projectId&&target.projectId!==project?.id){const next=await act({type:'selectProject',id:target.projectId});if(!next||next.error)throw Error(next?.error||'Could not reopen that project.');}
        setProduct('code');setView(target.view);if(target.view==='chat'||target.view==='project')setCreating(Boolean(target.creating));
      }else if(target.area==='spaces'){
        if(target.id&&target.id!==spacesState?.activeId)await spacesCommand({type:'select',id:target.id});
        if(target.pageId&&(target.id!==spacesState?.activeId||target.pageId!==spacesState?.page?.id))await spacesCommand({type:'openPage',pageId:target.pageId});
        setSpacesHome(target.home);setProduct(target.product);if(target.product==='code')setView('spaces');else{setPersonalMode('work');setSpacesVisible(true);setSitesVisible(false);}
      }else if(target.area==='sites'){
        if(target.id&&target.id!==sitesState?.activeId)await sitesCommand({type:'select',id:target.id});
        setSitesHome(target.home);setProduct(target.product);if(target.product==='code')setView('sites');else{setPersonalMode('work');setSitesVisible(true);}
      }else if(target.area==='work'){
        if(target.id&&target.id!==workState?.activeId)await workCommand({type:'select',id:target.id});
        setProduct('personal');setPersonalMode('work');setWorkHome(target.home);setSitesVisible(false);setSpacesVisible(false);
      }else{
        if(target.id!==personalState?.library.selectedId||target.destination!==personalDestination){const next=await bridge?.personal(target.id?{type:'selectItem',id:target.id}:{type:'navigate',destination:target.destination});if(next?.error)throw Error(next.error);}
        setProduct('personal');setPersonalMode('chat');
      }
      setProfileMenuOpen(false);setMobileNav(false);setReviewOpen(false);setThreadsOpen(false);
    },onError:setLocalError});
  useEffect(()=>bridge?.onPersonalShortcut?.(shortcut=>{if(shortcut==='back')navigationHistory.go(-1);else if(shortcut==='forward')navigationHistory.go(1);}),[bridge,navigationHistory.go]);
  if (!bridge) return <main className="browser-fallback"><Terminal size={32} /><h1>MuseBench desktop</h1><p>Open the Windows application to work with your local projects and Muse.</p></main>;
  if (!state) return <main className="loading"><LoaderCircle className="spin" size={24} /><p>Opening MuseBench…</p>{localError && <p role="alert">{localError}</p>}</main>;
  const tasks = (state.tasks ?? []).filter(t=>!t.archived).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));
  const filteredTasks = tasks.filter(item => `${item.title} ${state.projects.find(p => p.id === item.projectId)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const filteredProjects = state.projects.filter(item => `${item.name} ${item.root}`.toLowerCase().includes(query.toLowerCase()));
  const systemMessages = task?.messages.filter(item => item.role === 'system') ?? [];
  let initialUserSeen = false;
  const visibleMessages = task?.messages.filter(item => {if(item.role === 'system')return false;if(item.role === 'user'&&!initialUserSeen){initialUserSeen=true;return !(task.mode==='muse'&&item.text===task.request);}return true;}) ?? [];
  const openThread=(id?:string)=>{setSelectedRunId(id);setReviewOpen(false);setThreadsOpen(true);};
  const openFile=(path?:string)=>{setSelectedFilePath(path);setThreadsOpen(false);setReviewOpen(true);setStage('changes');};
  const runActivity=(promptId:string)=>(task?.runs??[]).filter(run=>run.promptId===promptId).map(run=><RunActivity key={run.id} run={run} shellResults={(task?.shellResults??[]).filter(item=>item.runId===run.runId||run.ownedRunIds?.includes(item.runId))} onOpen={()=>openThread(run.id)}/>);
  const initialPrompt=task?.messages.find(item=>item.role==='user');
  const profileAction=(action:ProfileAction)=>{setProfileMenuOpen(false);setMobileNav(false);if(action==='profile'){if(view!=='profile'||product!=='code')profileReturn.current={product,view};setProduct('code');setView('profile');setModal(null);}else if(action==='settings')setModal('settings');else showCommand(action);};
  const navigateShortcut=(destination:CodeDestination)=>{setProduct('code');setView(destination);setMobileNav(false);setProfileMenuOpen(false);setModal(null);if(destination==='spaces')setSpacesHome(true);if(destination==='sites')setSitesHome(true);};
  const shortcutSelected=codeDestinations.find(item=>item.id===view)?.id??(view==='project'?'projects':view==='chat'?'home':undefined);
  const composerControl=<div ref={composerShell} className="composer-shell">{showTask&&!!((task?.contextSummary?.omittedMessages??0)+(task?.contextSummary?.truncatedMessages??0))&&<button className="context-chip" onClick={()=>setModal('context')}>Last request: {task!.contextSummary!.omittedMessages} messages omitted · {task!.contextSummary!.truncatedMessages} shortened</button>}{showTask&&task?.queueError&&<p role="alert" className="popover-help">Queue stopped: {task.queueError}</p>}{showTask&&task?.nativeSession?.status==='needs-recovery'&&<button type="button" className="context-chip" onClick={()=>setModal('session')}>Session interrupted · Choose how to continue</button>}<ChatComposer canSteer={state.runtime.steeringSupported&&!codeImages.length&&!contextFiles.length} fullAccess={state.runtime.fullAccess} modelCatalog={state.runtime.modelCatalog} onRefreshModels={()=>void act({type:'refreshModels'})} images={codeImages} imageProjectId={project?.id??''} onRemoveImage={id=>setCodeImages(codeImages.filter(image=>image.id!==id))} onAddImages={files=>void imageUploads.add(files)} uploadingImages={imageUploads.uploading} onRunQueue={showTask&&!!task?.promptQueue?.length&&!task.archived?()=>void act({type:'resumeQueue'}):undefined} onQueue={showTask&&task?.mode==='muse'&&!task.archived?()=>void queueMessage():undefined} onContext={()=>project?setModal('context'):void openFolder('chat')} onCommand={(id,args,prefix)=>void command(id,args,prefix)} onLoadSkills={loadSkills} skills={skills} skillsStatus={skillsStatus} theme={preferences.theme} model={state.runtime.modelId??''} value={message} onChange={setMessage} inputRef={composer} onSubmit={() => void submit()} onChooseProject={() => void openFolder('chat')} onStop={() => void act({type:'disconnectMuse'})} onConnection={() => setModal('runtime')} onOptions={options => {if(showTask) void act({type:'setRunOptions',runOptions:options}); else setDraftOptions(options);}} options={showTask?restoreRunOptions(task?.runOptions):draftOptions} taskMode={showTask?(task!.mode==='demo'?'muse':task!.mode):mode} onTaskMode={setMode} messageMode={messageMode} onMessageMode={setMessageMode} showTask={showTask} busy={busy} running={runtimeActive} canSend={canSend} enterToSend={preferences.enterToSend} active={product==='code'&&(view==='chat'||view==='project')&&!modal&&!profileMenuOpen&&!mobileNav} context={`${project?.id??''}:${task?.id??''}:${creating}`} /></div>;
  const createSample = async () => { const next = await act({ type: 'createDemo' }); if (next && !next.error) { setCreating(false); setView('chat'); setMobileNav(false); } };
  return <NavigationHistoryContext.Provider value={navigationHistory}><div className={`app ${preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNav ? 'nav-open' : ''}`} style={{ '--review-width': `${reviewWidth}px` } as CSSProperties}>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside hidden={product !== 'code'} inert={product !== 'code'} className="sidebar" aria-label="Projects and chats">
      {preferences.sidebarCollapsed&&!mobileNav&&product==='code'&&<CompactNavigation selected={shortcutSelected} onNavigate={navigateShortcut} onPlugin={plugin=>openCustomize('plugins',plugin.title)} onManage={()=>openCustomize('plugins')} revision={shortcutRevision} obscured={Boolean(modal||profileMenuOpen)}/>}
      <SidebarChrome expanded={!preferences.sidebarCollapsed} onToggle={toggleSidebar}/><div className="sidebar-heading"><ProductSwitcher product={product} onChange={selectProduct}/></div>
      <button className="navigation-row new-chat" aria-label="New chat" disabled={navigationBusy} onClick={newChat}><Plus size={18} /><span>New chat</span><kbd>Ctrl N</kbd></button>
      <button className="navigation-row customize-navigation" onClick={()=>openCustomize()}><CustomizeIcon size={18}/><span>Customize</span></button>
      <div className="sidebar-scroll"><ChatSidebar orders={state.sidebarOrder} projects={state.projects} tasks={state.tasks??[]} selectedId={showTask?task?.id:undefined} projectId={project?.id} overview={view==='project'} busy={navigationBusy} active={product==='code'} onProject={id=>void navigateProject(id)} onChat={id=>void navigateTask(id)} onNew={id=>void newProjectChat(id)} onFolder={()=>{setMobileNav(false);setModal('create-project');}} onSearch={openSearch} act={act}/>
       </div><ProfileMenu open={product==='code'&&profileMenuOpen} onOpenChange={setProfileMenuOpen} onAction={profileAction} compact={preferences.sidebarCollapsed&&!mobileNav} profile={accountProfile}/>
    </aside>
    <div hidden={product !== 'code'||codeSpaces||codeSites} inert={product !== 'code'||codeSpaces||codeSites} className="workspace"><header className="topbar"><button className="icon-button collapsed-toggle" aria-label="Expand sidebar" onClick={toggleSidebar}><PanelLeft size={17} /></button><button className="icon-button mobile-toggle" aria-label="Open navigation" onClick={() => setMobileNav(true)}><PanelLeft size={17} /></button><NavigationButtons/><div className="breadcrumbs">{view === 'project' && <><span>Projects</span><span className="breadcrumb-slash">/</span></>}{(view === 'chat'||view === 'project') && project ? <button className="project-breadcrumb" aria-label="Project overview" title={project.root} disabled={navigationBusy} onClick={() => void navigateProject(project.id)}>{project.name.replace(' · tutorial', '')}</button> : <span>{codeDestinations.find(item=>item.id===view)?.label??(view === 'profile' ? 'Profile' : view === 'customize' ? 'Prompt starters' : 'MuseBench')}</span>}{view === 'chat' && <><span className="breadcrumb-slash">/</span><strong>{showTask ? task?.title : 'New chat'}</strong></>}</div><div className="topbar-actions"><ChatFind active={product==='code'&&!codeSpaces&&!codeSites&&!modal&&!mobileNav&&!profileMenuOpen} context={`${view}:${showTask?task?.id:''}`} transcript={transcript}/>{showTask && view === 'chat' && <><button className={`toolbar-button ${threadsOpen?'active':''}`} aria-label="Toggle threads panel" aria-pressed={threadsOpen} onClick={()=>threadsOpen?setThreadsOpen(false):openThread()}><MessageSquare size={16}/><span>Threads</span>{!!task?.runs?.filter(run=>['working','queued'].includes(run.status)).length&&<span className="count">{task.runs.filter(run=>['working','queued'].includes(run.status)).length}</span>}</button></>}</div></header>
      {(view==='home'||view==='projects'||view==='scheduled'||view==='images')&&<CodeDestinations destination={view} projects={state.projects??[]} tasks={state.tasks??[]} busy={busy||runtimeActive} onNew={newChat} onFolder={()=>{setMobileNav(false);setModal('create-project');}} onProject={id=>void navigateProject(id)} onChat={id=>void navigateTask(id)} onHome={()=>navigateShortcut('home')}/>}
      {view === 'profile' && <ProfilePage profile={accountProfile} tasks={state.tasks??[]} projects={state.projects??[]} onBack={()=>{setProduct(profileReturn.current.product);setView(profileReturn.current.view);}} onProject={id=>void navigateProject(id)} onSave={saveProfile} busy={busy||runtimeActive}/>}
      {view === 'project' && project && <ProjectOverview key={project.id} act={act} composer={<>{contextFiles.length>0&&<div className="composer-context-strip">{contextFiles.map(file=><button className="context-chip" key={file.path} onClick={()=>setContextFiles(contextFiles.filter(f=>f.path!==file.path))}>{file.path} ×</button>)}</div>}{composerControl}</>} onRepository={url=>void bridge.openExternal(url).catch(error=>setLocalError(String(error)))} project={project} chats={(state.tasks??[]).filter(chat => chat.projectId === project.id)} busy={busy || runtimeActive} onOpenChat={id => void navigateTask(id)} />}
      {view === 'customize' && <main className="customize-view"><button className="text-link" aria-label="Home" onClick={()=>setView('chat')}><ChevronRight size={14} style={{transform:'rotate(180deg)'}}/>Back to chat</button><div className="customize-heading"><h1>Prompt starters</h1><p>A workspace that works the way you do.</p></div><div className="customize-tabs"><span className="selected">Prompt starters</span><button onClick={() => setModal('settings')}>Preferences</button><button onClick={() => setModal('runtime')}>Muse connection</button></div><section className="customize-banner"><div><span className="overline">BUILT FOR YOUR CODE</span><h2>Your project. Your workflow.</h2><p>Start with a focused request, work with Muse, and keep every change within reach.</p><button className="button" disabled={busy || runtimeActive} onClick={newChat}>Start a chat<ArrowUp size={14} /></button></div><Terminal size={58} strokeWidth={1} /></section><div className="section-title"><h2>For your next task</h2><span>Editable prompts</span></div><div className="starter-grid">{starters.map(item => <button className="starter-card" aria-label={`Use starter: ${item.title}`} key={item.title} disabled={busy || runtimeActive} onClick={() => useStarter(item.prompt)}><span className="starter-icon"><item.icon size={21} /></span><span><strong>{item.title}</strong><p>{item.description}</p><small>Open in a new chat</small></span><Plus size={16} /></button>)}</div><div className="customize-note"><Keyboard size={18} /><div><strong>Stay on the keyboard</strong><p><kbd>Ctrl K</kbd> to find a chat. <kbd>Ctrl N</kbd> to start another. <kbd>Ctrl ,</kbd> to make it yours.</p></div></div><p className="muted customize-disclosure">Starters fill your composer. Edit the request, then send it to Muse.</p></main>}<div hidden={view !== 'chat'} inert={view !== 'chat'} className={`work-area ${showTask && (reviewOpen||threadsOpen) ? 'with-review' : ''}`}>
        <main className={`conversation ${!showTask ? 'new-conversation' : ''}`}>
          {showTask && task ? <div className="conversation-transcript" ref={transcript} onScroll={e => { const target = e.currentTarget; setScrolledUp(target.scrollHeight - target.scrollTop - target.clientHeight > 100); }}><div className="transcript-inner"><article className="message user-message" data-timeline-prompt=""><p>{task.request}</p>{initialPrompt?.images?.length&&project?<CodeImages images={initialPrompt.images} projectId={project.id}/>:null}</article>{initialPrompt?.text===task.request&&runActivity(initialPrompt.id)}
            {systemMessages.length > 0 && <details className="activity-details"><summary><Terminal size={14} /><span>Workspace activity</span><small>{systemMessages.length} updates</small><ChevronDown size={13} /></summary><div>{systemMessages.map(item => <p key={item.id}>{item.text}</p>)}</div></details>}
            {visibleMessages.map(item => <div key={item.id} id={`turn-${item.id}`}><article data-timeline-prompt={item.role==='user'?'':undefined} data-timeline-answer={item.role==='assistant'?'':undefined} className={`message ${item.role}-message`}>{item.role === 'user' ? <><p>{item.text}</p>{!!item.images?.length&&project&&<CodeImages images={item.images} projectId={project.id}/>} {!!item.files?.length&&<small>{item.files.length} source files attached</small>}</> : <MarkdownText text={item.text} />}{item.role === 'assistant' && <ResponseActions message={item} chatId={task.id} branchDisabled={busy||runtimeActive} onBranch={async()=>{const next=await act({type:'forkTask',messageId:item.id});if(next&&!next.error){setCreating(false);setView('chat');setReviewOpen(false);}}}/>}</article>{item.role==='user'&&runActivity(item.id)}</div>)}
            {!task.runs?.length&&<ShellCommands results={task.shellResults ?? []} />}{Boolean(state.runtime.pending) && <button className="permission-banner" onClick={() => setModal('runtime')}><ShieldCheck size={17} /><span>Muse needs your decision. Review the permission request.</span><ChevronRight size={15} /></button>}
            {runtimeActive && !task.runs?.some(run=>run.status==='working') && <div className="working-indicator" role="status"><LoaderCircle size={15} className="spin" />Muse is working in your project…<button className="text-link" onClick={() => void act({ type: 'disconnectMuse' })}>Stop</button></div>}
            {!runtimeActive&&!!task.changes.length&&<ChangedFiles key={task.id} files={task.changes} onOpenFile={openFile} onOpenAll={()=>openFile()}/>}
          </div></div> : <div className="new-chat-content"><div className="welcome-mark"><Terminal size={30} strokeWidth={1.4} /></div><h1>What would you like to build?</h1><p>{project ? `Work with Muse in ${project.name.replace(' · tutorial', '')}.` : 'A focused workspace for you, your code, and Muse.'}</p>{!project && <div className="welcome-actions"><button className="button" disabled={busy} onClick={() => void openFolder()}><FolderOpen size={16} />Open a folder</button><button className="text-link" disabled={busy} onClick={createSample}>Try sample project<ChevronRight size={14} /></button></div>}</div>}
          <PromptTimeline transcript={transcript} active={showTask&&product==='code'&&view==='chat'&&!modal&&!profileMenuOpen&&!mobileNav} context={task?.id??''} />
          <div className="composer-region">{scrolledUp && showTask && <button className="jump-latest icon-button" title="Jump to latest" aria-label="Jump to latest" onClick={() => { setScrolledUp(false); transcript.current?.scrollTo({ top: transcript.current.scrollHeight }); }}><ArrowDown size={16} /></button>}
            {showTask && task?.mode === 'muse' && !runtimeActive && !connected && <div className="composer-notice"><Terminal size={13} /><span>{['blocked','uncertain','failed','error'].includes(state.runtime.status) ? 'Muse needs attention before continuing.' : 'Send a message to connect to Muse.'}</span><button onClick={() => setModal('runtime')}>Connection settings</button></div>}
            {showTask&&task?.goal&&<div className="goal-notice"><Target size={13}/><span>{task.goal.status==='paused'?'Paused: ':''}{task.goal.objective}</span>{task.goal.driver?.armed&&<button onClick={()=>void act({type:'pauseGoalContinuation'})}>Stop continuation</button>}<button onClick={()=>showCommand('goal')}>Edit goal</button></div>}
            {showTask&&task?.archived&&<div className="chat-archived-banner">Archived chat<button className="text-link" onClick={()=>void act({type:'setTaskFlags',id:task.id,archived:false})}>Restore to continue</button></div>}
            {showTask&&!!task?.promptQueue?.length&&<PromptQueue key={task.id} items={task.promptQueue} busy={busy}
              onMove={async(id,beforeId)=>{const next=await act({type:'moveQueued',taskId:task.id,id,beforeId});return Boolean(next&&!next.error);}}
              onEdit={async item=>{const next=await act({type:'removeQueued',id:item.id});if(next&&!next.error){setMessage(item.text);setContextFiles(item.files);setCodeImages(item.images??[]);setMessageMode(item.mode);composer.current?.focus();}}}
              onRemove={id=>void act({type:'removeQueued',id})}/>}
            {project&&contextFiles.length>0&&<div className="composer-context-strip">{contextFiles.map(file=><button className="context-chip" key={file.path} title="Remove file context" onClick={()=>setContextFiles(contextFiles.filter(f=>f.path!==file.path))}>{file.path} ×</button>)}</div>}
            {view!=='project'&&composerControl}
            {!showTask && <div className="quick-starters">{starters.slice(0, 3).map(item => <button key={item.title} onClick={() => setMessage(item.prompt)}><item.icon size={14} />{item.title}</button>)}</div>}
          </div>
        </main>
        {showTask&&task&&threadsOpen&&<aside className="review-dock threads-dock" aria-label="Work threads"><WorkThreads runs={task.runs??[]} selectedRunId={selectedRunId} shellResults={task.shellResults??[]} active={product==='code'&&view==='chat'&&!modal} onClose={()=>setThreadsOpen(false)} onStop={()=>void act({type:'disconnectMuse'})} onSelectRun={id=>{setThreadsOpen(false);const run=task.runs?.find(item=>item.id===id);const target=run&&document.getElementById(`turn-${run.promptId}`);if(target){setScrolledUp(true);target.scrollIntoView({block:'start',behavior:preferences.reducedMotion?'instant':'smooth'});}else transcript.current?.scrollTo({top:0});composer.current?.focus();}}/></aside>}
        {showTask && task && <aside className={`review-dock ${reviewOpen ? '' : 'dock-hidden'}`} aria-label={stage==='changes'?'File changes':stage==='preview'?'Project preview':'Project checks'} aria-hidden={!reviewOpen} inert={!reviewOpen}><div className="review-resizer" role="separator" aria-label="Resize details panel" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={800} aria-valuenow={reviewWidth} tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setReviewWidth(width => Math.max(360, Math.min(800, width + (e.key === 'ArrowLeft' ? 24 : -24)))); } }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setReviewWidth(Math.max(360, Math.min(800, window.innerWidth - e.clientX))); }} /><div className="review-dock-heading"><span><Files size={15} />{stage==='changes'?'File changes':stage==='preview'?'Project preview':'Project checks'}</span><button className="icon-button" aria-label="Close details panel" onClick={() => setReviewOpen(false)}><X size={16} /></button></div><ProjectToolsPanel state={state} busy={busy || runtimeActive} act={act} stage={stage} selectedFilePath={selectedFilePath} onSelectFilePath={setSelectedFilePath} /></aside>}
      </div>
    </div>
    <aside hidden={product !== 'personal'} inert={product !== 'personal'} className="sidebar personal-sidebar" aria-label="Meta AI sidebar">
      <SidebarChrome expanded={!preferences.sidebarCollapsed} onToggle={toggleSidebar}/><div className="sidebar-heading"><ProductSwitcher product={product} onChange={selectProduct}/></div>
      {personalMode==='work'?<div className="work-spaces-navigation"><WorkSidebar searchOpen={personalSearchOpen} onSearchOpenChange={setPersonalSearchOpen} state={workState} disabled={Boolean(workState?.busy)} onNew={()=>{setSitesVisible(false);setSpacesVisible(false);setWorkHome(true);setMobileNav(false);}} onSelect={async id=>{await workCommand({type:'select',id});setSitesVisible(false);setSpacesVisible(false);setWorkHome(false);setMobileNav(false);}}><SitesSidebar state={sitesState} selected={sitesVisible} onHome={()=>{setSitesVisible(true);setSitesHome(true);setMobileNav(false);}} onSelect={async id=>{setSitesVisible(true);setSitesHome(false);setMobileNav(false);await sitesCommand({type:'select',id});}}/><SpacesSidebar state={spacesState} selected={spacesVisible&&!sitesVisible} onHome={()=>{setSitesVisible(false);setSpacesVisible(true);setSpacesHome(true);setMobileNav(false);}} onSelect={async id=>{setSitesVisible(false);setSpacesVisible(true);setSpacesHome(false);setMobileNav(false);await spacesCommand({type:'select',id});}}/></WorkSidebar></div>:<PersonalNavigation schedules={personalState?.schedules} agentProfile={personalState?.agentProfile} destination={personalDestination} onNavigate={navigatePersonal} onAction={action => { setMobileNav(false); void personalCommand({ type: 'serviceAction', action }); }} onCommand={personalSidebarCommand} library={personalState?.library} filterRef={personalFilter} searchOpen={personalSearchOpen} onSearchOpenChange={setPersonalSearchOpen} available={personalState?.available ?? { bot: true, chat: true, ideas: false, goals: false }} />}
      <button className="navigation-row customize-navigation" onClick={()=>openCustomize()}><CustomizeIcon size={18}/><span>Customize</span></button>
      <ProfileMenu open={product==='personal'&&profileMenuOpen} onOpenChange={setProfileMenuOpen} onAction={profileAction} compact={preferences.sidebarCollapsed&&!mobileNav} profile={accountProfile}/>
    </aside>
    <PersonalWorkspace modeSwitch={personalDestination==='chat'?workModeSwitch:null} active={product === 'personal'&&personalMode==='chat'} obscured={Boolean(modal || mobileNav || profileMenuOpen || localError || state.error)} destination={personalDestination} state={personalState} command={personalCommand} onNavigationOpen={revealSidebar} onSettings={() => setModal('settings')} collapsed={preferences.sidebarCollapsed} onToggleSidebar={toggleSidebar} />
    {(localError || state.error) && <div className="error-toast" role="alert"><Info size={18} /><div><strong>That step needs attention</strong><p>{localError || state.error}</p></div><button className="icon-button" aria-label="Dismiss error" onClick={() => { setLocalError(null); void act({ type: 'clearError' }); }}><X size={16} /></button></div>}
    {modal === 'command' && <CommandDialog onNavigate={id=>{closeModal();void command(id,'','');}} key={`${commandView.id}:${task?.id??''}`} command={commandView} state={{...state,task:showTask?state.task:null}} busy={busy||runtimeActive} act={act} close={closeModal} onDraft={commandDraft} onError={setLocalError}/> }
    <WorkWorkspace active={product==='personal'&&personalMode==='work'&&!spacesVisible&&!sitesVisible} obscured={Boolean(modal||mobileNav||profileMenuOpen)} state={workState} command={workCommand} importSources={importSources} exportArtifact={exportArtifact} onNavigationOpen={revealSidebar} onToggleSidebar={toggleSidebar} collapsed={preferences.sidebarCollapsed} onSettings={()=>setModal('settings')} modeSwitch={workModeSwitch} preferences={preferences} home={workHome} onHomeChange={setWorkHome}/>
    <SpacesWorkspace active={codeSpaces||(product==='personal'&&personalMode==='work'&&spacesVisible&&!sitesVisible)} state={spacesState} command={spacesCommand} workItems={workState?.items??[]} workBusy={Boolean(workState?.busy)} onOpenWork={()=>{setProduct('personal');setPersonalMode('work');setSitesVisible(false);setSpacesVisible(false);setWorkHome(false);}} modeSwitch={codeSpaces?null:workModeSwitch} onNavigationOpen={revealSidebar} preferences={preferences} home={spacesHome} onHomeChange={setSpacesHome}/>
    <SitesWorkspace active={codeSites||(product==='personal'&&personalMode==='work'&&sitesVisible)} state={sitesState} command={sitesCommand} importFolder={importFolder} connect={connectHosting} pollAuth={pollAuth} workItems={workState?.items??[]} workBusy={Boolean(workState?.busy)} modeSwitch={codeSites?null:workModeSwitch} onNavigationOpen={revealSidebar} preferences={preferences} home={sitesHome} onHomeChange={setSitesHome}/>
    {modal==='extensions'&&<CustomizeDialog initialTab={customizeTab} initialQuery={customizeQuery} close={closeModal} running={customizeBlocked(state,workState,sitesState,sitesState?.generation)} onConnection={()=>setModal('runtime')} onChanged={()=>{setShortcutRevision(value=>value+1);skillsKey.current='';loadSkills();}} onPersonal={action=>{closeModal();setProduct('personal');setPersonalMode('chat');void personalCommand({type:'serviceAction',action});}}/>}
    {modal==='workflows'&&<WorkflowLibrary state={state} busy={busy} act={act} close={closeModal}/>}
    {modal==='handoff'&&task&&<ContextHandoff source={task} tasks={state.tasks} initialText={message} files={contextFiles} busy={busy} act={act} close={closeModal}/>}
    {modal==='session'&&task&&<SessionDialog runtime={state.runtime} task={task} projects={state.projects} busy={busy||runtimeActive} act={act} onClose={closeModal}/> }
    {modal==='worktrees'&&project&&<WorktreeDialog appState={state} project={project} busy={busy||runtimeActive} act={act} onClose={closeModal} onOpened={()=>{closeModal();setCreating(true);setView('project');}}/>}
    {modal==='context'&&project&&<CodeContext task={showTask?task:null} project={project} taskId={showTask?task!.id:null} text={message} files={contextFiles} onFiles={setContextFiles} act={act} busy={busy||runtimeActive} close={closeModal}/>}
    {modal === 'runtime' && <RuntimeDialog state={state} busy={busy} act={act} close={closeModal} onError={setLocalError} />}{modal === 'settings' && <SettingsDialog openCustomize={()=>openCustomize()} state={state} busy={busy||runtimeActive||Boolean(state.runtime.pending)} act={act} openPersonal={destination=>{closeModal();navigatePersonal(destination);}} preferences={preferences} onChange={setPreferences} close={closeModal} openConnection={() => setModal('runtime')} />}{modal === 'history' && <CheckpointDialog state={state} act={act} close={closeModal} />}
    {modal === 'create-project' && <CreateProject root={state.projectCreationRoot??'Documents/MuseBench'} close={closeModal} onExisting={async()=>{await openFolder();setModal(null);}} onCreate={async details=>{const next=await act({type:'createProject',...details});if(!next||next.error)throw Error(next?.error??'Could not create the project.');setProduct('code');setView('project');setCreating(false);setReviewOpen(false);setMobileNav(false);setModal(null);}}/>}
    {modal === 'search' && <ChatLibrary projects={state.projects} onProject={id=>void navigateProject(id)} onOpen={id=>void navigateTask(id)} act={act} busy={navigationBusy} close={closeModal}/> }
  </div></NavigationHistoryContext.Provider>;
}
