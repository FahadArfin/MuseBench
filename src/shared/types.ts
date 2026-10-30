export interface NativeChild {workflowRunId?:string;childSessionId?:string;itemId:string;turnId?:string;kind:'subagent'|'workflow';revision:number;status:string;controlStatus?:string;objective?:string;label?:string;fallbackText?:string;truncated?:boolean;result?:{summary?:string;text?:string;errorKind?:string};children?:{childId:string;attempt:number;status:string;terminal?:string;label?:string;failureReason?:string}[];}
export interface ChildControlReceipt {commandId:string;sessionId:string;itemId:string;revision:number;action:string;status:string;body?:string;childId?:string;attempt?:number;at:string;reason?:string;}
export interface CompactionReceipt {commandId:string;sessionId:string;turnId:string;status:string;reason?:string;at:string;itemId?:string;tokensBefore?:number;tokensAfter?:number;summarizedThrough?:string;}
export interface DictationState { id: string | null; status: 'idle' | 'starting' | 'listening' | 'stopping' | 'error'; available: boolean | null; language: string | null; text: string; error: string | null; }
export interface RunOptions {model?:string; budget?:'standard'|'extended'|'deep'; reasoning: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'; approval: 'ask' | 'auto' | 'never'; }
export interface RuntimeState {runOptions?:RunOptions;inputAccepted?:boolean;runId?:string|null;}
export type Stage = 'plan' | 'changes' | 'preview' | 'checks' | 'review';
export type CheckStatus = 'not-run' | 'running' | 'passed' | 'failed' | 'cancelled' | 'stale';
export interface Project {lessons?:import('./project-lessons.mjs').ProjectLesson[];validationScripts?:string[];worktree?:{id:string;sourceRoot:string;branch:string;base:string}; repositoryUrl?:string|null; branch?:string|null; id: string; name: string; root: string; demo: boolean; scripts: Record<string,string>; instructions?:string; }
export interface FileChange { path: string; status: 'added' | 'modified' | 'deleted'; additions: number; deletions: number; before: string; after: string; binary?: boolean; approximate?: boolean; }
export type WorkStatus = 'queued'|'working'|'waiting'|'completed'|'failed'|'cancelled'|'interrupted';
export interface ActivityItem {workflow?:{parentRunId:string;parallelLimit:number};id:string;kind:'model'|'tool'|'agent';title:string;tool:string;status:WorkStatus;detail:string;output:string;truncated?:boolean;agentId?:string;}
export interface WorkRun {id:string;promptId:string;prompt:string;runId:string|null;ownedRunIds?:string[];status:WorkStatus;startedAt:string;endedAt?:string;reason?:string;activities:ActivityItem[];truncated?:boolean;}
export interface Message { contextTruncated?:boolean; id: string; role: 'user' | 'assistant' | 'system'; text: string; at: string; turnId?:string; outcome?:WorkStatus; images?:CodeImage[];files?:ContextFile[]; sources?:(ContextFile&{text:string})[]; }
export interface ShellResult { callId: string; runId: string; toolName: 'powershell'; command: string; output: string; exitCode: number; terminalStatus: 'completed' | 'failed'; terminalReason?: string; truncated: boolean; outcome: string; }
export interface Check { id: string; script: string; command: string; status: CheckStatus; revision: string; exitCode: number | null; log: string; startedAt: string; endedAt?: string; }
export interface Checkpoint { id: string; taskId: string; title: string; revision: string; createdAt: string; }
export interface TaskSummary {runtimeBusy?:boolean; runtimeStatus?:string|null; pinned?:boolean; archived?:boolean; archivedAt?:string|null; id: string; projectId: string; title: string; mode: 'demo' | 'manual' | 'muse'; createdAt: string; updatedAt: string; acceptedRevision: string | null; }
export interface Task extends TaskSummary {childControlReceipts?:ChildControlReceipt[];compactionReceipts?:CompactionReceipt[];steeringReceipts?:{commandId:string;turnId:string;status:string;text:string;at:string}[];reviewContract?:import('./reviewer-contracts.mjs').ReviewContract;reviewChildren?:string[];reviewUsage?:import('./native-usage.mjs').NativeUsage|null;executionReceipts?:ExecutionReceipt[];checkReceipts?:Check[];validationRun?:{scripts:string[];revision:string;index:number;status:CheckStatus};skillReceipts?:import('./skill-receipts.mjs').SkillReceipt[];nativeUsage?:import('./native-usage.mjs').NativeUsage|null;queueError?:string;nativeSession?:{id:string;root:string;seeded:boolean;status:'ready'|'running'|'needs-recovery';transport?:'exec'|'msp';fullAccess?:boolean;workspaceTools?:boolean}|null; forkedFrom?:string; promptQueue?:QueuedPrompt[]; queuePaused?:boolean;queueHold?:boolean; contextSummary?:ContextSummary; goal?: {driver?:import('./goal-driver.mjs').GoalDriver;objective:string;status:"active"|"paused"}|null; runOptions?: RunOptions; runs?:WorkRun[]; request: string; plan: string; criteria: string[]; planApproved: boolean; baselineRevision: string; revision: string; changes: FileChange[]; messages: Message[]; shellResults: ShellResult[]; check: Check | null; previewRevision: string | null; runtimeComplete: boolean; }
export interface Preview { status: 'stopped' | 'starting' | 'running' | 'failed'; url: string | null; log: string; script: string | null; }
export interface RuntimeState {restoringRequests?:number;nativeSessionId?:string|null;sessionSeeded?:boolean;imagesSupported?:boolean;modelsSupported?:boolean;hooksSupported?:boolean;workspaceTools?:boolean;restoredMessages?:unknown[];restoration?:{status:string;sessionId:string;viewCursor?:string;historyMode?:string;pendingRequests?:unknown[];activeTurnId?:string|null;turnCount?:number}|null;questionsSupported?:boolean;pendingRequests?:Array<{kind:string;sessionId:string;approvalId?:string;userInputId?:string;revision:number}>;inputResponses?:Array<{status:string;userInputId?:string;outcome?:string}>;inputResponse?:{status:string;userInputId?:string;outcome?:string}|null;childrenBusy?:boolean;foregroundActive?:boolean;rootTurnId?:string;ownedTurnIds?:string[];childWorkPending?:number;childControlsSupported?:boolean;children?:{items:NativeChild[];truncated:boolean};childReceipts?:ChildControlReceipt[];operationBusy?:boolean;compactionSupported?:boolean;compaction?:CompactionReceipt|null;interactiveAvailable?:boolean;steeringSupported?:boolean;turnId?:string|null;steering?:{status:string;commandId:string;turnId:string}|null;fullAccess?:boolean;modelCatalog?:import("./models.mjs").NativeModelCatalog;runLimits?:{steps:number;wallTimeMs:number;tokenBudget:null};simulation?:boolean;permissionVerified?:boolean;durableSessions?:boolean; modelId?:string|null; status: string; reason: string | null; binary: string | null; sdkVersion: string; hostVersion?: string; sessionId?: string | null; liveVerified: boolean; messages?: unknown[]; pending?: unknown; transport?: 'exec' | 'msp'; shellEnabled?: boolean; shellUnavailableReason?: string | null; shellResults?: ShellResult[]; activity?:{items:ActivityItem[];truncated:boolean}; }
export interface AppState {workflows?:import('./workflows.mjs').Workflow[];backgroundChats?:boolean; sidebarOrder?:Record<string,string[]>; projectCreationRoot?:string; drafts?:Record<string,CodeDraft>; memories?:string; projects: Project[]; tasks: TaskSummary[]; activeProject: Project | null; task: Task | null; checkpoints: Checkpoint[]; preview: Preview; runtime: RuntimeState; busy: boolean; error: string | null; }
export interface ChildInspection {
 itemId:string;sessionId:string;childSessionId:string;revision:number;status:'loading'|'ready'|'error';readAt?:string;error?:string;
 data?:{session:{sessionId:string;kind?:string;status?:string;modelId?:string;providerId?:string;workspaceRoot?:string};
 history:{mode:string;available:boolean;reason?:string;totalItems?:number;omittedItems?:number;shortened:boolean;items:Array<{itemId:string;kind:string;status?:string;tool?:string;text:string;shortened:boolean;recordedAt?:string}>};
 tokens?:{promptTokens:number;outputTokens:number;totalTokens:number};
 worktree?:{worktreeRoot?:string;baseCommit?:string;headCommit?:string;ownership?:string;cleanupPolicy?:string;cleanupState?:string;parentDirtyExcluded?:boolean}};
}
export interface RuntimeState {connectionEpoch?:number;childInspections?:ChildInspection[];}
export type Action = {type:'setActivityRead';ids:string[];read:boolean} | {type:'stopWork';taskId:string;id:string;controlId:string} | {type:'inspectChild';taskId:string;sessionId:string;itemId:string;revision:number} | {type:'saveValidationProfile';projectId:string;scripts:string[]} | {type:'runValidation'} | {type:'refreshModels'}
  | {type:'createReviewer';parentTaskId:string;projectId:string;role:string;question:string} | {type:'integrateReview';taskId:string} | {type:'cancelReviewers'}
  | {type:'continueGoal';maxRounds:number;minutes:number} | {type:'pauseGoalContinuation'}
  | {type:'proposeLesson';projectId:string;taskId:string;messageId:string;title:string;text:string;applicability:string}
  | {type:'decideLesson';projectId:string;id:string;decision:'accept'|'reject'|'revoke'}
  | {type:'restoreCheckpoint';taskId:string;id:string;revision:string;paths:string[]}
  | {type:'archiveWorktree'|'restoreWorktree';projectId:string;id:string} | {type:'recoverWorktree';projectId:string;id:string;branch:string} | {type:'setupWorktree';projectId:string;script:string}
  | {type:'saveWorkflow';workflow:import('./workflows.mjs').Workflow} | {type:'deleteWorkflow';id:string} | {type:'queueWorkflow';id:string;taskId:string;workflowId:string;objective:string}
  | {type:'handoffContext';id:string;sourceTaskId:string;targetTaskId:string;text:string;files:ContextFile[]}
  | {type:'recoverSession';choice:'continue'|'fresh'}
  | {type:'createWorktree';projectId:string;branch:string;base:string} | {type:'openWorktree';projectId:string;id:string}
  | {type:'moveSidebarItem';kind:'project'|'chat';id:string;section:'projects'|'project'|'pinned'|'recents';projectId?:string;beforeId?:string|null}
  | {type:'createProject';name:string;goals:string;context:string}
  | {type:"renameTask";id?:string;title:string} | {type:"setMemories";text:string} | {type:"setGoal";objective:string;status:"active"|"paused"}
  | {type:'openProject';path:string} | {type:'selectProject';id:string} | {type:'selectTask';id:string} | {type:'createDemo'} | {type:'createCommandCopy'}
  | {type:'newTask';request:string;mode:'manual'|'muse'|'demo';runOptions?:RunOptions} | {type:'setRunOptions';runOptions:RunOptions} | {type:'setExecutionAccess';taskId:string;fullAccess:boolean}
  | {type:'updatePlan';plan:string;criteria:string[]} | {type:'approvePlan'} | {type:'applyDemo'}
  | {type:'refresh'} | {type:'runCheck';script:string} | {type:'cancelCheck'}
  | {type:'startPreview';script:string} | {type:'stopPreview'} | {type:'inspectPreview';revision:string}
  | {type:'accept';revision:string} | {type:'sendMessage';text:string;mode?:'chat'|'plan';images?:CodeImage[];files?:ContextFile[]}
  | {type:'connectMuse';binary?:string;fullAccess?:boolean;transport?:'exec'|'msp';workspaceTools?:boolean} | {type:'childControl';taskId:string;sessionId:string;itemId:string;revision:number;action:string;body?:string;childId?:string;attempt?:number} | {type:'compactSession';taskId:string;sessionId:string;turnId:string} | {type:'steerMessage';taskId:string;expectedTurnId:string;text:string} | {type:'disconnectMuse'} | {type:'runtimeDecision';decision:string} | ({type:'answerInput';taskId:string}&import('./user-input.mjs').InputAction)
  | {type:'clearError'}
  | {type:'setProjectInstructions';projectId:string;text:string}
  | {type:'saveDraft';projectId:string;taskId:string|null;text:string;images?:CodeImage[];files?:ContextFile[];mode?:'chat'|'plan'}
  | {type:'deleteTask';id:string;allowUnarchived?:boolean}
  | {type:'setTaskFlags';id:string;pinned?:boolean;archived?:boolean}
  | {type:'forkTask';messageId:string}
  | {type:'queueMessage';text:string;images?:CodeImage[];files?:ContextFile[];mode?:'chat'|'plan';runOptions?:RunOptions}
  | {type:'moveQueued';taskId:string;id:string;beforeId:string|null}
  | {type:'beginQueueEdit'|'sendQueued';taskId:string;id:string;expectedRevision:number}
  | {type:'editQueued';taskId:string;id:string;expectedRevision:number;text:string;mode:'chat'|'plan'}
  | {type:'removeQueued';id:string;taskId?:string;expectedRevision?:number} | {type:'pauseQueue'|'resumeQueue'};
export type PersonalDestination = 'bot' | 'chat' | 'ideas' | 'goals';
export interface PersonalLibraryItem { id: string; kind: 'chat' | 'idea' | 'goal'; title: string; main?: boolean; }
export interface PersonalLibraryGroup { status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'signed-out'; items: PersonalLibraryItem[]; }
export interface PersonalLibrary { chats: PersonalLibraryGroup; ideas: PersonalLibraryGroup; goals: PersonalLibraryGroup; selectedId: string | null; }
export interface PersonalAppearance { theme: 'dark' | 'light'; textSize: 'small' | 'medium' | 'large'; font: 'system' | 'mono'; reducedMotion: boolean; }
// Frontend auth contract: clear on logout/account switch; no display name is inferred from the OS.
export interface AccountProfile { displayName: string; accountId?: string; accountName?: string; avatarSeed?: string; avatarImage?: string; setupComplete?: boolean; sample?: boolean; handle?: string; bio?: string; }
export interface PersonalSchedules {status: 'ready'|'loading'|'unavailable';items:{id:string;title:string;timing:string;ambiguous:boolean}[];}
export interface PersonalState { schedules?:PersonalSchedules|null; agentProfile?:{name:string;avatar:string|null}|null; profile?: AccountProfile | null; destination: PersonalDestination; loading: boolean; origin: string; error: string | null; canGoBack: boolean; canGoForward: boolean; visible: boolean; available: Record<PersonalDestination, boolean>; compact: boolean; notice: string | null; authenticating: boolean; authWindowOpen: boolean; library: PersonalLibrary; appearance?: PersonalAppearance; }
export type PersonalServiceAction = 'search' | 'feed' | 'library' | 'settings' | 'connections' | 'whatsapp';
export type MetaAction = 'newChat'|'search'|'media'|'artifacts'|'scheduled'|'vibes';
export type PersonalWarmTarget = 'bot'|'ideas'|'goals'|'muse-search'|'muse-feed'|'muse-library'|'meta-chat'|'meta-search'|'meta-media'|'meta-artifacts'|'meta-scheduled'|'meta-vibes';
export type PersonalCommand = {type:'prewarm';target:PersonalWarmTarget} | {type:'scheduleAction';action:'edit'|'options'|'new';id?:string} | {type:'metaAction';action:MetaAction} | { type: 'layout'; visible: boolean; bounds?: { x: number; y: number; width: number; height: number } } | { type: 'navigate'; destination: PersonalDestination } | { type: 'back' | 'forward' | 'reload' | 'openExternal' | 'dismissNotice' | 'refreshLibrary' | 'newMuseChat' } | { type: 'selectItem'; id: string } | { type: 'presentation'; compact: boolean } | { type: 'appearance'; appearance: PersonalAppearance } | { type: 'serviceAction'; action: PersonalServiceAction };
export interface MuseBenchBridge { analytics(options:{days:7|30;offset:number}):Promise<import("./analytics").AnalyticsData>; openProjectFile(input:{taskId:string;path:string;editor?:'preferred'|'vscode'|'choose';source?:'navigation'}):Promise<{opened:boolean}>; copyText?(text:string):Promise<void>; copyReply?(text:string):Promise<void>; configureNotifications(value:{completion:boolean;attention:boolean;sound:boolean}):Promise<{supported:boolean}>; commandInfo(type:"billing"|"skills"|"usage"|"export"|"mention"|"close"):Promise<{status:string;message?:string;usage?:import("./account-usage.mjs").AccountUsage;skills?:import("./slash-commands.mjs").MuseSkill[];rows?:{label:string;value:string}[];path?:string}>; dictation(command: 'status'|'refresh'|'start'|'stop'|'cancel'):Promise<DictationState>; onDictation(callback:(state:DictationState)=>void):()=>void; getState(): Promise<AppState>; dispatch(action: Action): Promise<AppState>; chooseProject(): Promise<string|null>; chooseBinary(): Promise<string|null>; onState(callback:(state:AppState)=>void):()=>void; openExternal(url:string):Promise<void>; personalState():Promise<PersonalState>; personal(command:PersonalCommand):Promise<PersonalState>; onPersonalState(callback:(state:PersonalState)=>void):()=>void; onPersonalShortcut(callback:(shortcut:string)=>void):()=>void; }
export interface RuntimeState {childrenBusy?:boolean;foregroundActive?:boolean;rootTurnId?:string;ownedTurnIds?:string[];childWorkPending?:number;childControlsSupported?:boolean;children?:{items:NativeChild[];truncated:boolean};childReceipts?:ChildControlReceipt[];operationBusy?:boolean;compactionSupported?:boolean;compaction?:CompactionReceipt|null;interactiveAvailable?:boolean;steeringSupported?:boolean;turnId?:string|null;steering?:{status:string;commandId:string;turnId:string}|null;fullAccess?:boolean;modelCatalog?:import("./models.mjs").NativeModelCatalog;permissionVerified?:boolean;cleanup?:string;}
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
export interface MuseBenchBridge {mobileDevice(command:import('./mobile-types').MobileDeviceCommand):Promise<import('./mobile-types').MobileDeviceState>;}
export interface MuseBenchBridge {
 nativeControl(command:{type:'status'|'enable'|'disable'}):Promise<import('./native-control-types').NativeControlState>;
 onNativeRequest?(callback:(request:import('./native-control-types').NativeRequest)=>Promise<unknown>):()=>void;
}
declare global { interface Window { musebench?: MuseBenchBridge } }
export interface MuseBenchBridge {
  readonly windowControlsOverlay?: boolean;
  readonly launch?: { readonly active:boolean; complete():Promise<void> };
  setWindowTheme?(theme:'light'|'dark'):Promise<void>;
}

export interface WorkActivity {id:string;taskId:string;projectId:string;title:string;projectName:string;label:string;kind:'run'|'check';canStop:boolean;controlId:string;}
export interface AppState {workActivity?:WorkActivity[];}
export interface ActivityEvent {id:string;taskId:string;source:'run'|'check';sourceId:string;kind:string;at:string;readAt:string|null;title:string;projectName:string;}
export interface AppState {activityInbox?:ActivityEvent[];}
export interface ContextFile {path:string;hash:string;}
export interface CodeImage {id:string;name:string;mime:string;bytes:number;}
export interface CodeDraft {images?:CodeImage[];text:string;files:ContextFile[];mode:'chat'|'plan';updatedAt?:string;}
export interface QueuedPrompt extends CodeDraft {revision?:number;delivery?:'ready'|'sending'|'unknown';requiredChecks?:string[];workflow?:{id:string;title:string;phase:string;index:number;total:number};handoff?:{id:string;sourceTaskId:string;sourceTitle:string};id:string;runOptions:RunOptions;at:string;}
export interface ContextReceipt {version:number;promptHash:string;revision:string|null;historyMode:string;nativeContext:string;messages:{id:string;role:string;truncated:boolean}[];sources:{path:string;hash:string;characters:number}[];instructions:{personal:string|null;project:string|null};characters:number;}
export interface ContextSummary {receipt?:ContextReceipt;historyMode?:'replay'|'native'|'connection';characters:number;estimatedTokens:number;includedMessages:number;omittedMessages:number;truncatedMessages:number;fileCount:number;replayedFiles:number;limit:number;}
export interface CodeContextResult extends ContextSummary {prompt:string;attachments:(ContextFile&{text:string})[];files:(ContextFile&{characters:number})[];}
export interface ChatSearchResult extends TaskSummary {projectName:string;snippet:string;messageId?:string;offset?:number;at?:string;}
export interface HistoryPage {messages:(Message&{textLength:number;offset:number;captureTruncated?:boolean})[];total:number;before:string|null;coverage:string;}
export interface McpInventory {sessionId:string;readAt:string;servers:{name:string;source:'settings'|'plugin'|'session'|'unknown';transport:'stdio'|'streamableHttp'|'unknown';oauth:'loggedIn'|'loggedOut'|'notSupported'|'unknown'}[];omitted:number;simulation?:boolean;}
export interface RuntimeState {connectionEpoch?:number;}
export interface MuseBenchBridge {
 readMcpServers(input:{taskId:string;sessionId:string}):Promise<McpInventory>;
 inspectCodeContext(input:{projectId:string;taskId:string|null;text:string;files:ContextFile[]}):Promise<CodeContextResult>;
 readChatHistory(input:{taskId:string;before?:string;messageId?:string;offset?:number;limit?:number}):Promise<HistoryPage>;
 searchChats(input:{query:string;includeArchived:boolean}):Promise<ChatSearchResult[]>;
 inspectWorktrees(input:{projectId:string}):Promise<WorktreeState>;
 importCodeImage(input:{projectId:string;taskId:string|null;name:string;dataUrl:string}):Promise<CodeImage>;
 readCodeImage(input:{projectId:string;image:CodeImage}):Promise<string>;
 saveCodeDraft(input:{images?:CodeImage[];projectId:string;taskId:string|null;text:string;files:ContextFile[];mode:'chat'|'plan'}):Promise<void>;
}

export interface ManagedWorktree {archiveCommit?:string;archivedAt?:string;recoveredFrom?:string;id:string;path:string;branch:string;base:string;commit:string;sourceRoot:string;createdAt:string;status:string;available:boolean;locked?:boolean;}
export interface WorktreeState {root:string;branch:string;head:string;dirty:boolean;items:ManagedWorktree[];}

export interface CapturedOutput {id:string;label:string;status:string;received:number;length:number;captureTruncated:boolean;sourceTruncated:boolean;}
export interface OutputPage {items:CapturedOutput[];selected:(CapturedOutput&{offset:number;text:string;match:number|null})|null;}
export interface MuseBenchBridge {readCapturedOutput(input:{taskId:string;id?:string;offset?:number;query?:string}):Promise<OutputPage>;}

export interface CheckpointComparison {revision:string;files:(FileChange&{restorable:boolean})[];operations:{id:string;status:string;completed:number;total:number}[];}
export interface MuseBenchBridge {inspectCheckpoint(input:{taskId:string;id:string}):Promise<CheckpointComparison>;}

export interface ExecutionReceipt {id:string;phase:string;result:string;acceptance:string;delivery:string;createdAt:string;updatedAt:string;runId?:string|null;nativeSessionId?:string|null;processId?:number|null;hostVersion?:string|null;promptHash?:string;revision?:string;reason?:string|null;}
export type AppUpdateCommand='status'|'check'|'download'|'install';
export interface AppUpdateState {version:string;status:'idle'|'unsupported'|'checking'|'current'|'available'|'downloading'|'downloaded'|'installing'|'restart-required'|'error';availableVersion:string|null;downloadedVersion?:string|null;releaseNotes?:string;releaseDate?:string|null;blockers?:{id:string;label:string;detail:string}[];percent:number;lastChecked:string|null;error:string|null;simulation?:boolean;}
export interface MuseBenchBridge {appUpdate(command:AppUpdateCommand):Promise<AppUpdateState>;onAppUpdate(callback:(state:AppUpdateState)=>void):()=>void;}

export interface SemanticQuery {projectId:string;operation:'definition'|'references'|'implementation'|'hover';path:string;line:number;column:number;}
export interface SemanticLocation {path:string;line:number;column:number;endLine:number;endColumn:number;}
export interface SemanticResult {operation:SemanticQuery['operation'];path:string;line:number;column:number;items:SemanticLocation[];hover:(SemanticLocation&{display:string;documentation:string})|null;truncated:boolean;snapshot:string;scope:{files:number;bytes:number;entries:number;skipped:{symlinks:number;directories:number};config:string;standardLibrary:boolean;excludedDirectories:string[]};engine:string;elapsedMs:number;}
export interface MuseBenchBridge {semanticNavigate(input:SemanticQuery):Promise<SemanticResult>;}

export interface SignInState {status:'ready'|'required'|'pending'|'unknown';message?:string;method?:'api'|'subscription';loginUrl?:string;userCode?:string}
export interface OnboardingState {code:SignInState;personal:SignInState;simulation?:boolean}
export type OnboardingCommand={type:'status'|'loginCode'|'loginPersonal'|'cancel'}|{type:'apiKey';key:string};
export interface MuseBenchBridge {onboarding(command:OnboardingCommand):Promise<OnboardingState>}
export interface CodeBillingState {mode:'cli'|'account'|'api';source?:'account'|'api'|'unknown';status:'ready'|'error';hasApiKey:boolean;billingAccountId:string|null;busy:boolean;accountState?:string;message?:string;simulation?:boolean}
export type CodeBillingCommand={type:'status'}|{type:'select';source:'account'|'api'}|{type:'saveApiKey';key:string}|{type:'linkBilling';accountId:string}|{type:'checkout';destination:'subscriptions'|'apiBilling'|'apiKeys'|'planDetails';external?:boolean};
export interface MuseBenchBridge {codeBilling(command:CodeBillingCommand):Promise<{state?:CodeBillingState;opened?:boolean;external?:boolean;simulation?:boolean}>;onBillingChanged(callback:()=>void):()=>void;}
