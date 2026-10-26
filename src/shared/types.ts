export interface DictationState { id: string | null; status: 'idle' | 'starting' | 'listening' | 'stopping' | 'error'; available: boolean | null; language: string | null; text: string; error: string | null; }
export interface RunOptions { reasoning: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'; approval: 'ask' | 'auto' | 'never'; }
export type Stage = 'plan' | 'changes' | 'preview' | 'checks' | 'review';
export type CheckStatus = 'not-run' | 'running' | 'passed' | 'failed' | 'cancelled' | 'stale';
export interface Project {worktree?:{id:string;sourceRoot:string;branch:string;base:string}; repositoryUrl?:string|null; branch?:string|null; id: string; name: string; root: string; demo: boolean; scripts: Record<string,string>; instructions?:string; }
export interface FileChange { path: string; status: 'added' | 'modified' | 'deleted'; additions: number; deletions: number; before: string; after: string; binary?: boolean; approximate?: boolean; }
export type WorkStatus = 'queued'|'working'|'waiting'|'completed'|'failed'|'cancelled'|'interrupted';
export interface ActivityItem {id:string;kind:'model'|'tool'|'agent';title:string;tool:string;status:WorkStatus;detail:string;output:string;truncated?:boolean;agentId?:string;}
export interface WorkRun {id:string;promptId:string;prompt:string;runId:string|null;ownedRunIds?:string[];status:WorkStatus;startedAt:string;endedAt?:string;reason?:string;activities:ActivityItem[];truncated?:boolean;}
export interface Message { id: string; role: 'user' | 'assistant' | 'system'; text: string; at: string; turnId?:string; outcome?:WorkStatus; images?:CodeImage[];files?:ContextFile[]; sources?:(ContextFile&{text:string})[]; }
export interface ShellResult { callId: string; runId: string; toolName: 'powershell'; command: string; output: string; exitCode: number; terminalStatus: 'completed' | 'failed'; terminalReason?: string; truncated: boolean; outcome: string; }
export interface Check { id: string; script: string; command: string; status: CheckStatus; revision: string; exitCode: number | null; log: string; startedAt: string; endedAt?: string; }
export interface Checkpoint { id: string; taskId: string; title: string; revision: string; createdAt: string; }
export interface TaskSummary { pinned?:boolean; archived?:boolean; archivedAt?:string|null; id: string; projectId: string; title: string; mode: 'demo' | 'manual' | 'muse'; createdAt: string; updatedAt: string; acceptedRevision: string | null; }
export interface Task extends TaskSummary {nativeSession?:{id:string;root:string;seeded:boolean;status:'ready'|'running'|'needs-recovery'}|null; forkedFrom?:string; promptQueue?:QueuedPrompt[]; queuePaused?:boolean; contextSummary?:ContextSummary; goal?: {objective:string;status:"active"|"paused"}|null; runOptions?: RunOptions; runs?:WorkRun[]; request: string; plan: string; criteria: string[]; planApproved: boolean; baselineRevision: string; revision: string; changes: FileChange[]; messages: Message[]; shellResults: ShellResult[]; check: Check | null; previewRevision: string | null; runtimeComplete: boolean; }
export interface Preview { status: 'stopped' | 'starting' | 'running' | 'failed'; url: string | null; log: string; script: string | null; }
export interface RuntimeState {simulation?:boolean;permissionVerified?:boolean;durableSessions?:boolean; modelId?:string|null; status: string; reason: string | null; binary: string | null; sdkVersion: string; hostVersion?: string; sessionId?: string | null; liveVerified: boolean; messages?: unknown[]; pending?: unknown; transport?: 'exec' | 'msp'; shellEnabled?: boolean; shellUnavailableReason?: string | null; shellResults?: ShellResult[]; activity?:{items:ActivityItem[];truncated:boolean}; }
export interface AppState { sidebarOrder?:Record<string,string[]>; projectCreationRoot?:string; drafts?:Record<string,CodeDraft>; memories?:string; projects: Project[]; tasks: TaskSummary[]; activeProject: Project | null; task: Task | null; checkpoints: Checkpoint[]; preview: Preview; runtime: RuntimeState; busy: boolean; error: string | null; }
export type Action =
  | {type:'recoverSession';choice:'continue'|'fresh'}
  | {type:'createWorktree';projectId:string;branch:string;base:string} | {type:'openWorktree';projectId:string;id:string}
  | {type:'moveSidebarItem';kind:'project'|'chat';id:string;section:'projects'|'project'|'pinned'|'recents';projectId?:string;beforeId?:string|null}
  | {type:'createProject';name:string;goals:string;context:string}
  | {type:"renameTask";title:string} | {type:"setMemories";text:string} | {type:"setGoal";objective:string;status:"active"|"paused"}
  | {type:'openProject';path:string} | {type:'selectProject';id:string} | {type:'selectTask';id:string} | {type:'createDemo'} | {type:'createCommandCopy'}
  | {type:'newTask';request:string;mode:'manual'|'muse'|'demo';runOptions?:RunOptions} | {type:'setRunOptions';runOptions:RunOptions}
  | {type:'updatePlan';plan:string;criteria:string[]} | {type:'approvePlan'} | {type:'applyDemo'}
  | {type:'refresh'} | {type:'runCheck';script:string} | {type:'cancelCheck'}
  | {type:'startPreview';script:string} | {type:'stopPreview'} | {type:'inspectPreview';revision:string}
  | {type:'accept';revision:string} | {type:'sendMessage';text:string;mode?:'chat'|'plan';images?:CodeImage[];files?:ContextFile[]}
  | {type:'connectMuse';binary?:string} | {type:'disconnectMuse'} | {type:'runtimeDecision';decision:string}
  | {type:'clearError'}
  | {type:'setProjectInstructions';projectId:string;text:string}
  | {type:'saveDraft';projectId:string;taskId:string|null;text:string;images?:CodeImage[];files?:ContextFile[];mode?:'chat'|'plan'}
  | {type:'deleteTask';id:string}
  | {type:'setTaskFlags';id:string;pinned?:boolean;archived?:boolean}
  | {type:'forkTask';messageId:string}
  | {type:'queueMessage';text:string;images?:CodeImage[];files?:ContextFile[];mode?:'chat'|'plan';runOptions?:RunOptions}
  | {type:'moveQueued';taskId:string;id:string;beforeId:string|null}
  | {type:'removeQueued';id:string} | {type:'pauseQueue'|'resumeQueue'};
export type PersonalDestination = 'bot' | 'chat' | 'ideas' | 'goals';
export interface PersonalLibraryItem { id: string; kind: 'chat' | 'idea' | 'goal'; title: string; }
export interface PersonalLibraryGroup { status: 'idle' | 'loading' | 'ready' | 'unavailable'; items: PersonalLibraryItem[]; }
export interface PersonalLibrary { chats: PersonalLibraryGroup; ideas: PersonalLibraryGroup; goals: PersonalLibraryGroup; selectedId: string | null; }
export interface PersonalAppearance { theme: 'dark' | 'light'; textSize: 'small' | 'medium' | 'large'; font: 'system' | 'mono'; reducedMotion: boolean; }
// Frontend auth contract: clear on logout/account switch; no display name is inferred from the OS.
export interface AccountProfile { displayName: string; avatarSeed?: string; sample?: boolean; handle?: string; bio?: string; }
export interface PersonalSchedules {status: 'ready'|'loading'|'unavailable';items:{id:string;title:string;timing:string;ambiguous:boolean}[];}
export interface PersonalState { schedules?:PersonalSchedules|null; agentProfile?:{name:string;avatar:string|null}|null; profile?: AccountProfile | null; destination: PersonalDestination; loading: boolean; origin: string; error: string | null; canGoBack: boolean; canGoForward: boolean; visible: boolean; available: Record<PersonalDestination, boolean>; compact: boolean; notice: string | null; authenticating: boolean; authWindowOpen: boolean; library: PersonalLibrary; appearance?: PersonalAppearance; }
export type PersonalServiceAction = 'search' | 'feed' | 'library' | 'settings' | 'connections' | 'whatsapp';
export type MetaAction = 'newChat'|'search'|'media'|'artifacts'|'scheduled'|'vibes';
export type PersonalCommand = {type:'scheduleAction';action:'edit'|'options'|'new';id?:string} | {type:'metaAction';action:MetaAction} | { type: 'layout'; visible: boolean; bounds?: { x: number; y: number; width: number; height: number } } | { type: 'navigate'; destination: PersonalDestination } | { type: 'back' | 'forward' | 'reload' | 'openExternal' | 'dismissNotice' | 'refreshLibrary' | 'newMuseChat' } | { type: 'selectItem'; id: string } | { type: 'presentation'; compact: boolean } | { type: 'appearance'; appearance: PersonalAppearance } | { type: 'serviceAction'; action: PersonalServiceAction };
export interface MuseBenchBridge { openProjectFile(input:{taskId:string;path:string;editor?:'preferred'|'vscode'|'choose'}):Promise<{opened:boolean}>; copyText?(text:string):Promise<void>; configureNotifications(value:{completion:boolean;attention:boolean;sound:boolean}):Promise<{supported:boolean}>; commandInfo(type:"skills"|"usage"|"export"|"mention"|"close"):Promise<{status:string;message?:string;skills?:import("./slash-commands.mjs").MuseSkill[];rows?:{label:string;value:string}[];path?:string}>; dictation(command: 'status'|'refresh'|'start'|'stop'|'cancel'):Promise<DictationState>; onDictation(callback:(state:DictationState)=>void):()=>void; getState(): Promise<AppState>; dispatch(action: Action): Promise<AppState>; chooseProject(): Promise<string|null>; chooseBinary(): Promise<string|null>; onState(callback:(state:AppState)=>void):()=>void; openExternal(url:string):Promise<void>; personalState():Promise<PersonalState>; personal(command:PersonalCommand):Promise<PersonalState>; onPersonalState(callback:(state:PersonalState)=>void):()=>void; onPersonalShortcut(callback:(shortcut:string)=>void):()=>void; }
export interface RuntimeState {permissionVerified?:boolean;cleanup?:string;}
export interface MuseBenchBridge {
 customize(command:import('./customize-types').CustomizeCommand):Promise<import('./customize-types').CustomizeResult>;
 sitesState():Promise<import('./sites-types').SitesState>;
 sites(command:import('./sites-types').SitesCommand):Promise<import('./sites-types').SitesState>;
 sitesImport(replace?:boolean):Promise<import('./sites-types').SitesState>;
 sitesReadFile(path:string):Promise<{text:string}>;
 sitesConnect(value:{token?:string;oauth?:boolean}):Promise<import('./sites-types').SitesState>;
 sitesAuthPoll():Promise<import('./sites-types').SitesState>;
 sitesOpen(target:'live'|'dashboard'|'domains'|'analytics'|'tokens'|'oauthSetup'):Promise<void>;
 sitesCopyUrl():Promise<void>;
 onSitesState(callback:(state:import('./sites-types').SitesState)=>void):()=>void;
 spacesState():Promise<import('./spaces-types').SpacesState>;
 spaces(command:import('./spaces-types').SpacesCommand):Promise<import('./spaces-types').SpacesState>;
 spacesCopyInvitation():Promise<void>;
 onSpacesState(callback:(state:import('./spaces-types').SpacesState)=>void):()=>void;
 workState():Promise<import('./work-types').WorkState>;
 work(command:import('./work-types').WorkCommand):Promise<import('./work-types').WorkState>;
 workImport():Promise<import('./work-types').WorkState>;
 workExport(format:import('./work-types').WorkExport):Promise<{saved:boolean;path?:string}>;
 onWorkState(callback:(state:import('./work-types').WorkState)=>void):()=>void;
}
declare global { interface Window { musebench?: MuseBenchBridge } }
export interface MuseBenchBridge {
  readonly windowControlsOverlay?: boolean;
  setWindowTheme?(theme:'light'|'dark'):Promise<void>;
}

export interface ContextFile {path:string;hash:string;}
export interface CodeImage {id:string;name:string;mime:string;bytes:number;}
export interface CodeDraft {images?:CodeImage[];text:string;files:ContextFile[];mode:'chat'|'plan';updatedAt?:string;}
export interface QueuedPrompt extends CodeDraft {id:string;runOptions:RunOptions;at:string;}
export interface ContextSummary {characters:number;estimatedTokens:number;includedMessages:number;omittedMessages:number;truncatedMessages:number;fileCount:number;replayedFiles:number;limit:number;}
export interface CodeContextResult extends ContextSummary {prompt:string;attachments:(ContextFile&{text:string})[];files:(ContextFile&{characters:number})[];}
export interface ChatSearchResult extends TaskSummary {projectName:string;snippet:string;}
export interface MuseBenchBridge {
 inspectCodeContext(input:{projectId:string;taskId:string|null;text:string;files:ContextFile[]}):Promise<CodeContextResult>;
 searchChats(input:{query:string;includeArchived:boolean}):Promise<ChatSearchResult[]>;
 inspectWorktrees(input:{projectId:string}):Promise<WorktreeState>;
 importCodeImage(input:{projectId:string;taskId:string|null;name:string;dataUrl:string}):Promise<CodeImage>;
 readCodeImage(input:{projectId:string;image:CodeImage}):Promise<string>;
 saveCodeDraft(input:{images?:CodeImage[];projectId:string;taskId:string|null;text:string;files:ContextFile[];mode:'chat'|'plan'}):Promise<void>;
}

export interface ManagedWorktree {id:string;path:string;branch:string;base:string;commit:string;sourceRoot:string;createdAt:string;status:string;available:boolean;locked?:boolean;}
export interface WorktreeState {root:string;branch:string;head:string;dirty:boolean;items:ManagedWorktree[];}
