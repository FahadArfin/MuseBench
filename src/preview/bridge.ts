import {discoverySelection,discoveryIdentity,sameDiscovery} from '../shared/tool-discovery.mjs';
import {observeCompaction,mergeCompactionHistory} from '../shared/compaction-history.mjs';
import {preparePreviewRecentContext,validatePreviewRecentContext,stagedPreviewRecentContext,consumePreviewRecentContext} from './recent-context';
import {normalizeWorkspaceToolset} from '../shared/workspace-analysis.mjs';
import {createPreviewIntegrationPanels} from './integration-panels';
import {customizeBlocked} from '../shared/customize-policy.mjs';
import {applyPreviewSchedule} from './code-schedules';
import {createBrowserPreviewAnnotations} from './preview-annotations';
import {createPreviewConversationImports} from './conversation-imports';
import {sourceLineCount} from '../shared/file-diff.mjs';
import {validateRunInspection,validateRunReview,validateRunFeedback} from '../shared/run-changes.mjs';
import type {RunChangeView} from '../shared/run-changes.mjs';
import {validateActivityRead} from '../shared/activity-inbox.mjs';
import {validateProjectActionRequest} from '../shared/project-actions.mjs';
import type {ProjectActionDefinition} from '../shared/project-actions.mjs';
import {projectRuntimeStatus,runtimeStatusBusy} from '../runtime/status.mjs';
import {workIdentity,workLabel} from '../shared/work-activity.mjs';
import {sampleAnalytics} from './analytics';
import {CURATED_EXTENSIONS} from '../shared/extension-catalog.mjs';
import type {CatalogEntry} from '../shared/extension-catalog-types';
const communityCatalog=async(kind:string)=>{
 const snapshot=await import('./community-catalog.json');
 return snapshot.entries.filter(item=>item.kind===(kind==='connectors'?'mcp':kind)).map(item=>({...item,kind})) as CatalogEntry[];
};
const resolveCatalog=async(id:string)=>CURATED_EXTENSIONS.find(item=>item.id===id)||(await import('./community-catalog.json')).entries.find(item=>item.id===id) as CatalogEntry|undefined;
import {createPreviewHookPresets} from './hook-presets.mjs';
import {inputPrompt,validateInputAnswers} from '../shared/user-input.mjs';
import {newGoalDriver,pauseGoalDriver} from '../shared/goal-driver.mjs';
import {proposeLesson,decideLesson} from '../shared/project-lessons.mjs';
import {composeChatContext} from '../shared/chat-context.mjs';
import {literalIndex} from '../shared/literal-search.mjs';
import {validateCheckScripts,missingChecks} from '../shared/validation.mjs';
import {validateHooks} from '../shared/native-hooks.mjs';
import uiSkill from '../../templates/musebench-skills/musebench-ui-parity/SKILL.md?raw';
import runtimeSkill from '../../templates/musebench-skills/musebench-runtime-check/SKILL.md?raw';
import releaseSkill from '../../templates/musebench-skills/musebench-release-check/SKILL.md?raw';
import {MUSEBENCH_SKILL_PACK} from '../shared/skill-pack.mjs';
import {DEFAULT_WORKFLOWS,validateWorkflow,workflowPrompts} from '../shared/workflows.mjs';
import {handoffText} from '../shared/context-handoff.mjs';
import {moveQueuedPrompt,queuedPrompt,editQueuedPrompt} from '../shared/queued-prompts.mjs';
import {loadSnapshots,prewarmSnapshot,selectSnapshot,selectedSnapshot,subscribeSnapshots,type SnapshotKey} from './snapshots';
import {planSidebarMove} from '../shared/sidebar-order.mjs';
import {projectDetails} from '../shared/create-project.mjs';
import type {CodeBillingState,OnboardingState,Action,AppState,MuseBenchBridge,PersonalState,Task,RuntimeState} from '../shared/types';
import type {WorkState,WorkItem} from '../shared/work-types';
import type {SitesState,SiteItem} from '../shared/sites-types';
import type {SpacesState,SpacePage} from '../shared/spaces-types';
import type {CustomizeState} from '../shared/customize-types';
import {demoArtifact,validateArtifact} from '../shared/work-artifacts.mjs';

const stamp='2026-10-26T14:00:00.000Z';
const copy=<T,>(value:T):T=>structuredClone(value);
const id=()=>crypto.randomUUID();
const desktop=async():Promise<never>=>{throw new Error('This action needs the MuseBench desktop app. Browser preview uses sample data only.');};
const runtime:RuntimeState={interactiveAvailable:true,simulation:true,transport:'exec',fullAccess:false,status:'ready',reason:'Browser preview · No model or shell connection',binary:null,sdkVersion:'Preview',modelId:'Muse · sample',liveVerified:false};
function task(title:string,taskId:string=id(),projectId='preview-project'):Task {
 return {id:taskId,projectId,title,mode:'muse',createdAt:stamp,updatedAt:stamp,acceptedRevision:null,request:title,plan:'',criteria:[],planApproved:false,baselineRevision:'sample-before',revision:'sample-after',changes:[],messages:[{id:id(),role:'user',text:title,at:stamp}],shellResults:[],check:null,previewRevision:null,runtimeComplete:true,runOptions:{reasoning:'high',approval:'ask'},runs:[]};
}
function channel<T>(get:()=>T){
 const listeners=new Set<(value:T)=>void>();
 return {read:async()=>copy(get()),on:(listener:(value:T)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},emit:()=>{const next=copy(get());for(const listener of listeners)listener(copy(next));return next;}};
}

export function createPreviewBridge():MuseBenchBridge {
 let discoveryReviewOwner:string|null=null;
 const discoveryFixture={id:'global:preview-docs',name:'Sample documentation',revision:'a'.repeat(64),address:'Sample executable (preview)',environmentKeys:['DOCS_TOKEN'],eligible:true,reason:'Preview sample. Startup at most 30s; calls at most 300s; stops with this connection.'};
 const remoteDiscoveryFixture={id:'global:preview-remote',name:'Remote documentation',revision:'b'.repeat(64),transport:'streamable-http' as const,address:'https://docs.example.invalid/private/${DOCS_PATH}',resolvedOrigin:'https://docs.example.invalid',headerKeys:['Authorization'],environmentKeys:['DOCS_PATH','DOCS_TOKEN'],eligible:true,reason:'Preview remote sample. No network requests. Startup at most 30s; calls at most 300s.'};
 const usageObservedAt=Date.now(),sampleResetAt=new Date(usageObservedAt+3*60*60*1000).toISOString(),sampleWeeklyResetAt=new Date(usageObservedAt+4*24*60*60*1000).toISOString();
 const project={id:'preview-project',name:'MuseBench sample',root:'Sample workspace / MuseBench',demo:false,scripts:{dev:'Sample preview · no command runs',test:'Example tests',build:'Example build'},instructions:'Keep the interface clear and accessible.'};
 const initial=task('Build a clearer project overview','preview-overview');
 initial.nativeSession={id:'10000000-0000-4000-8000-000000000001',root:project.root,seeded:true,status:'ready',transport:'exec'};
 initial.contextCompactions=[{sessionId:initial.nativeSession.id,itemId:'preview-compaction',turnId:'preview-old-turn',revision:1,status:'compacted',trigger:'auto',source:'restored',at:stamp}];
 initial.messages.push({id:id(),role:'assistant',at:stamp,text:'The project overview now keeps your recent threads together, with a clear place to start a new chat.\n\nYou can open the changed file below, explore the composer controls, or switch to Muse AI. This is fictional sample content for visual feedback.'});
 initial.changes=[{path:'src/ProjectOverview.tsx',status:'modified',additions:3,deletions:1,before:'<h1>Project</h1>\n',after:'<h1>Your project</h1>\n<p>Pick up where you left off.</p>\n<button>New chat</button>\n'}];
 initial.goal={objective:'Finish the sample project with passing validation',status:'active'};
 initial.executionReceipts=[{id:'sample-request',phase:'settled',result:'unknown',acceptance:'accepted',delivery:'not-requested',createdAt:stamp,updatedAt:stamp,reason:'Preview example: interrupted before the result was confirmed.'}];
 initial.runs=[{id:'sample-run',promptId:initial.messages[0].id,prompt:initial.request,runId:'sample',status:'completed',startedAt:stamp,endedAt:stamp,activities:[{id:'sample-layout',kind:'tool',title:'Updated the project overview',tool:'edit',status:'completed',detail:'src/ProjectOverview.tsx',output:'Sample change for preview only.'}]}];
 initial.runs[0].activities.push({id:'sample-workflow',kind:'tool',title:'Workflow: Preview review',tool:'workflow',status:'completed',detail:'Simulated workflow progress for preview only',output:'',workflow:{parentRunId:'sample',parallelLimit:2}});
 for(const message of initial.messages)if(message.role==='assistant')message.turnId='sample-run';
 const other=task('Polish the chat composer','preview-composer');
 other.messages.push({id:id(),role:'assistant',at:stamp,text:'A compact composer keeps attachments, reasoning, and approval controls close to your message. Open the menus to review their spacing.'});
 const imports=createPreviewConversationImports();
 const tasks=new Map([initial,other].map(t=>[t.id,t]));
 const state:AppState={workflows:copy(DEFAULT_WORKFLOWS),backgroundChats:true,projectCreationRoot:'Documents/MuseBench',projects:[project],tasks:[initial,other],activeProject:project,task:initial,checkpoints:[{id:'sample-checkpoint',taskId:initial.id,title:'Sample accepted revision',revision:'sample-before',createdAt:stamp}],preview:{status:'stopped',url:null,log:'',script:null},runtime:copy(runtime),busy:false,error:null,drafts:{}};
 state.codeSchedules=[];state.codeSchedulesAvailable=true;state.codeSchedulesSimulation=true;
 const sampleEventAt=new Date().toISOString();state.activityInbox=[{id:'a'.repeat(64),taskId:initial.id,source:'run',sourceId:'sample-completed',kind:'run_completed',at:sampleEventAt,readAt:null,title:initial.title,projectName:'Preview sample'},{id:'b'.repeat(64),taskId:other.id,source:'run',sourceId:'sample-question',kind:'response_requested',at:sampleEventAt,readAt:null,title:other.title,projectName:'Preview sample'}];
 const runtimeOwners=new Map<string,RuntimeState>(),activityTokens=new Map<string,{key:string;id:string}>();
 const code=channel(()=>state);
 function sync(){
  if(state.task)runtimeOwners.set(state.task.id,copy(state.runtime));
  state.tasks=[...tasks.values()].map(task=>({...task,runtimeBusy:runtimeStatusBusy(projectRuntimeStatus(runtimeOwners.get(task.id)??{})),runtimeStatus:runtimeOwners.get(task.id)?.status??null}));
  state.activityInbox=state.activityInbox?.flatMap(event=>{const task=tasks.get(event.taskId);return task?[{...event,title:task.title}]:[];});
  state.workActivity=[...runtimeOwners].flatMap(([taskId,value])=>{
   const task=tasks.get(taskId),status=projectRuntimeStatus(value);if(!task||!runtimeStatusBusy(status))return[];
   const identity=workIdentity(value),key=JSON.stringify([identity,status,task.messages.at(-1)?.id]);let token=activityTokens.get(taskId);if(token?.key!==key){token={key,id:(id()+id()).replaceAll('-','')};activityTokens.set(taskId,token);}
   return[{id:'run:'+taskId,taskId,projectId:task.projectId,title:task.title,projectName:state.projects.find(p=>p.id===task.projectId)?.name??'Sample project',label:workLabel(status,identity),kind:'run' as const,canStop:true,controlId:token.id}];
  });return code.emit();
 }
 const sampleWorktrees:import('../shared/types').ManagedWorktree[]=[];
 const projectActionDefinitions=new Map<string,ProjectActionDefinition[]>();let projectActionRevision=0;
 const reviewedRunFiles=new Set<string>();
 const runChangeView=(input:{taskId:string;runId:string}):RunChangeView=>{validateRunInspection(input);if(state.task?.id!==input.taskId)throw Error('The selected chat changed.');return{...input,status:'complete',revision:'d'.repeat(64),sample:true,files:initial.changes.map(file=>({...copy(file),beforeHash:'a'.repeat(64),afterHash:'b'.repeat(64),omitted:false,stale:false,reviewed:reviewedRunFiles.has(input.taskId+':'+input.runId+':'+file.path)})),omittedFiles:0};};
 const projectActionView=(input:{projectId:string;taskId:string})=>{
  if(input.projectId!==state.activeProject?.id||input.taskId!==state.task?.id)throw Error('The selected project or chat changed.');
  const definitions=projectActionDefinitions.get(input.projectId)??[{id:'sample-build',name:'Build site',cwd:'.',commands:{win32:'npm run build',linux:'npm run build',darwin:'npm run build'},timeoutSeconds:120}];
  return{...input,root:state.activeProject.root,platform:'win32' as const,revision:projectActionRevision.toString(16).padStart(64,'0'),sample:true,actions:definitions.map(definition=>({...copy(definition),folder:state.activeProject!.root+(definition.cwd==='.'?'':'/'+definition.cwd),command:definition.commands.win32??null,shell:'Windows PowerShell',supported:!!definition.commands.win32}))};
 };
 const imageData=new Map<string,string>();
 function reply(current:Task,text:string,images:import('../shared/types').CodeImage[]=[]){current.nativeSession??={id:id(),root:state.activeProject?.root??project.root,seeded:true,status:'ready'};current.messages.push({id:id(),role:'user',text,images,at:new Date().toISOString()},{id:id(),role:'assistant',text:'Preview reply — your message is shown here so you can review the conversation layout. No request was sent to Muse and no project files were changed.',at:new Date().toISOString()});current.updatedAt=new Date().toISOString();}
 async function dispatch(action:Action):Promise<AppState>{
  const current=state.task,previousRuntime=copy(state.runtime);
  switch(action.type){
   case 'prepareRecentContext':case 'stageRecentContext':case 'removeRecentContext':case 'setRecentContextPreference':{
    state.error=null;try{
    if(!current||current.id!==action.taskId||current.projectId!==action.projectId||current.archived||current.mode!=='muse')throw Error('Open the original active Muse chat.');
    const saved=current.recentContext??={count:4,autoPrepare:false,prepared:null,stagedDigest:null};
    if(action.type==='prepareRecentContext'){if(saved.stagedDigest)throw Error('Remove the included excerpts before preparing another selection.');saved.prepared=await preparePreviewRecentContext(current,action.count);saved.count=action.count;}
    if(action.type==='stageRecentContext'){if(saved.prepared?.digest!==action.digest)throw Error('Recent excerpts changed. Prepare and review them again.');await validatePreviewRecentContext(current,saved.prepared);saved.stagedDigest=action.digest;}
    if(action.type==='removeRecentContext')saved.stagedDigest=null;
    if(action.type==='setRecentContextPreference')saved.autoPrepare=action.enabled;
    }catch(error){state.error=error instanceof Error?error.message:String(error);}
    break;
   }
   case 'codeSchedule':applyPreviewSchedule(state,action);break;
   case 'saveProjectAction':case 'runProjectAction':{const input=validateProjectActionRequest(action),view=projectActionView(input);if(view.revision!==input.revision)throw Error('Project actions changed. Review again.');if(input.type==='runProjectAction')throw Error('Preview only. Run project actions from the installed desktop app.');const definitions=view.actions.map(({id,name,cwd,commands,timeoutSeconds})=>({id,name,cwd,commands,timeoutSeconds}));projectActionDefinitions.set(input.projectId,[...definitions.filter(row=>row.id!==input.definition.id),copy(input.definition)]);projectActionRevision++;break;}
   case 'setRunFileReviewed':{const input=validateRunReview(action),view=runChangeView(input);if(view.revision!==input.revision||!view.files.some(file=>file.path===input.path))throw Error('The review changed. Refresh.');const key=input.taskId+':'+input.runId+':'+input.path;if(input.reviewed)reviewedRunFiles.add(key);else reviewedRunFiles.delete(key);break;}
   case 'setActivityRead':{validateActivityRead(action);state.activityInbox=state.activityInbox?.map(event=>action.ids.includes(event.id)?{...event,readAt:action.read?new Date().toISOString():null}:event);break;}
   case 'createReviewer':if(current){const child=task('Review · '+action.question);child.reviewContract={parentTaskId:current.id,parentProjectId:current.projectId,sourceRevision:'sample-after',inputRevision:'sample-after',role:action.role,question:action.question,budget:'standard',createdAt:stamp};child.messages.push({id:id(),role:'assistant',text:JSON.stringify({findings:[],unresolved:['Preview only. No independent native review was executed.']}),at:stamp});child.runtimeComplete=true;current.reviewChildren=[...(current.reviewChildren??[]),child.id];tasks.set(child.id,child);state.task=child;}break;
   case 'integrateReview':if(current?.reviewContract){const parent=tasks.get(current.reviewContract.parentTaskId);if(parent){const draft=state.drafts?.[`${parent.projectId}:${parent.id}`];if(draft?.text||draft?.files?.length||draft?.images?.length)throw Error('The parent already has a draft. Save or send it before integrating this review.');(state.drafts??={})[`${parent.projectId}:${parent.id}`]={text:'Simulated review: no native execution. Review the example findings before sending.',files:[],images:[],mode:'chat',updatedAt:stamp};state.task=parent;}}break;
   case 'cancelReviewers':break;

   case 'continueGoal':if(current?.goal){current.goal.driver=newGoalDriver(action);pauseGoalDriver(current.goal.driver,'Preview: no native runs are dispatched.');}break;
   case 'pauseGoalContinuation':pauseGoalDriver(current?.goal?.driver,'Paused by you');break;
   case 'setExecutionAccess':state.runtime={...state.runtime,fullAccess:action.fullAccess,transport:action.fullAccess?state.runtime.transport:'exec',status:'ready',permissionVerified:true,sessionId:'preview-connection'};break;
   case 'connectMuse':{const discovery=action.toolDiscovery?discoverySelection(action.toolDiscovery):undefined;if(current?.nativeSession?.unsupportedToolDiscovery)throw Error('Unsupported saved on-demand selection. Start fresh explicitly.');if(discovery&&(discoveryReviewOwner!==current?.id||discovery.sources.some(s=>![discoveryFixture,remoteDiscoveryFixture].some(f=>s.id===f.id&&s.revision===f.revision))))throw Error('Refresh and review current on-demand sources.');discoveryReviewOwner=null;if(current?.nativeSession&&(current.nativeSession.toolDiscovery?!sameDiscovery(current.nativeSession.toolDiscovery,discovery):!!discovery))throw Error('Review the exact saved on-demand sources again. Start fresh explicitly to change tools.');const selectedTransport=action.transport??current?.nativeSession?.transport??state.runtime.transport;if(discovery&&selectedTransport!=='msp')throw Error('On-demand tools require an interactive connection.');const selectedTools=selectedTransport==='msp'&&(action.workspaceTools??current?.nativeSession?.workspaceTools??false);if(action.workspaceToolset!==undefined&&(!selectedTools||selectedTransport!=='msp'))throw Error('Workspace tools require an interactive connection.');const selectedToolset=selectedTools?normalizeWorkspaceToolset(action.workspaceToolset??current?.nativeSession?.workspaceToolset):undefined;state.runtime.childInspections=[];state.runtime={...state.runtime,durableSessions:true,imagesSupported:true,modelsSupported:true,hooksSupported:true,workspaceTools:selectedTools,workspaceToolset:selectedToolset,toolDiscovery:discovery?discoveryIdentity({sources:discovery.sources}):undefined,restoration:selectedTransport==='msp'&&current?.nativeSession?.transport==='msp'?{status:'restored',sessionId:current.nativeSession.id,historyMode:'snapshot',turnCount:Math.floor(current.messages.length/2),pendingRequests:[]}:null,interactiveAvailable:true,foregroundActive:false,childrenBusy:false,childWorkPending:0,transport:selectedTransport,questionsSupported:selectedTransport==='msp',pending:null,pendingRequests:[],inputResponses:[],inputResponse:null,steeringSupported:selectedTransport==='msp',compactionSupported:selectedTransport==='msp',childControlsSupported:selectedTransport==='msp',children:selectedTransport==='msp'?{items:[{itemId:'sample-child',childSessionId:'preview-child-session',kind:'subagent',revision:2,status:'completed',controlStatus:'resultReady',objective:'Review keyboard navigation',result:{summary:'Sample result: keyboard focus follows the visible controls.'}},{itemId:'sample-workflow',kind:'workflow',revision:2,status:'completed',label:'Review workflow',children:[{childId:'sample-attempt',attempt:1,status:'terminal',terminal:'failed',label:'Accessibility check',failureReason:'Sample failed attempt'}]}],truncated:false}:{items:[],truncated:false},childReceipts:[],operationBusy:false,compaction:null,turnId:selectedTransport==='msp'?'preview-turn':null,fullAccess:action.fullAccess===true,status:'ready',sessionId:'preview-connection',permissionVerified:true,shellEnabled:true,reason:'Browser preview - Simulated connection; no commands run'};if(current&&selectedTransport==='msp')current.nativeSession={id:current.nativeSession?.transport==='msp'?current.nativeSession.id:'preview-native-session',root:state.activeProject?.root??project.root,seeded:true,status:'ready',transport:'msp',fullAccess:action.fullAccess===true,workspaceTools:selectedTools,...(discovery?{toolDiscovery:discoveryIdentity({sources:discovery.sources})}:{}),...(selectedToolset?{workspaceToolset:selectedToolset}:{})};break;}
   case 'stopWork':{const row=state.workActivity?.find(row=>row.taskId===action.taskId&&row.id===action.id&&row.controlId===action.controlId);if(!row)throw Error('This work changed. Open the current activity and try again.');const owner=tasks.get(row.taskId);if(owner){owner.queuePaused=true;owner.queueHold=!!owner.promptQueue?.length;}if(row.taskId===current?.id)return dispatch({type:'disconnectMuse'});runtimeOwners.set(row.taskId,{...runtime,status:'unavailable'});break;}
   case 'disconnectMuse':state.runtime.childInspections=[];state.runtime={...state.runtime,restoration:null,workspaceTools:false,pending:null,pendingRequests:[],fullAccess:false,foregroundActive:false,childrenBusy:false,childWorkPending:0,shellEnabled:false,status:'unavailable',sessionId:null,permissionVerified:false,reason:'Browser preview - Disconnected'};break;
   case 'proposeLesson':{if(state.activeProject)proposeLesson(state.activeProject,{id:id(),title:action.title,text:action.text,applicability:action.applicability,sourceTaskId:action.taskId,sourceMessageId:action.messageId,revision:'sample-after',validation:null});break;}
   case 'decideLesson':{if(state.activeProject)decideLesson(state.activeProject,action.id,action.decision);break;}
   case 'restoreCheckpoint':{state.checkpoints.unshift({id:id(),taskId:action.taskId,title:'Before restore (simulated)',revision:'sample-after',createdAt:stamp});break;}
   case 'refreshModels':state.runtime.modelCatalog={source:'Preview sample',models:[{id:'muse-preview',label:'Muse · sample',description:'Preview catalog only. No model request is sent.',efforts:['low','medium','high'],defaultEffort:'high',isDefault:true,contextLimit:null}]};break;
   case 'createProject':{const details=projectDetails(action);if(state.projects.some(p=>p.name.toLowerCase()===details.name.toLowerCase()))throw Error('A project with this name already exists.');const next={id:id(),name:details.name,root:`Documents/MuseBench/${details.name}`,demo:false,scripts:{},instructions:details.instructions};state.projects.push(next);state.activeProject=next;state.task=null;break;}
   case 'selectProject':state.activeProject=state.projects.find(p=>p.id===action.id)??project;break;
   case 'selectTask':state.task=tasks.get(action.id)??initial;state.activeProject=state.projects.find(p=>p.id===state.task!.projectId)??project;break;
   case 'newTask':{const next=task(action.request,id(),state.activeProject?.id??project.id);next.runOptions=action.runOptions??next.runOptions;next.messages.push({id:id(),role:'assistant',text:'Preview conversation created. Messages stay in this browser tab until you reset or reload.',at:stamp});tasks.set(next.id,next);state.task=next;break;}
   case 'createWorktree':case 'openWorktree':case 'recoverWorktree':{let item=action.type==='openWorktree'?sampleWorktrees.find(i=>i.id===action.id):undefined;if(action.type==='createWorktree'||action.type==='recoverWorktree'){if(!action.branch.trim()||action.branch.startsWith('-'))throw Error('Choose a valid branch.');item={id:id(),branch:action.branch,base:action.type==='createWorktree'?action.base:'sample-archive',commit:'sample-base',path:'Sample worktrees/'+action.branch,sourceRoot:project.root,createdAt:stamp,status:'ready',available:true};sampleWorktrees.push(item);}if(!item)throw Error('Worktree unavailable');let p=state.projects.find(p=>p.root===item!.path);if(!p){p={...project,id:id(),name:project.name+' · '+item.branch,root:item.path,branch:item.branch,worktree:{id:item.id,sourceRoot:item.sourceRoot,branch:item.branch,base:item.base}};state.projects.push(p);}state.activeProject=p;state.task=null;break;}
   case 'archiveWorktree':case 'restoreWorktree':{const item=sampleWorktrees.find(w=>w.id===action.id);if(item){item.status=action.type==='archiveWorktree'?'archived':'ready';if(action.type==='archiveWorktree')item.archiveCommit='sample-archive';}break;}
   case 'setupWorktree':if(current)current.check={id:id(),script:action.script,command:'Preview: '+action.script,status:'not-run',revision:current.revision,exitCode:null,log:'Preview only. No setup command was executed.',startedAt:stamp};break;
   case 'recoverSession':if(current){if(action.choice==='fresh')current.nativeSession=null;else if(current.nativeSession)current.nativeSession.status='ready';}break;
   case 'saveWorkflow':{const w=validateWorkflow(action.workflow);state.workflows=[...(state.workflows??[]).filter(i=>i.id!==w.id),w];break;}
   case 'deleteWorkflow':state.workflows=state.workflows?.filter(w=>w.id!==action.id);break;
   case 'saveValidationProfile':{if(!state.activeProject||state.activeProject.id!==action.projectId)throw Error('Project changed.');state.activeProject.validationScripts=validateCheckScripts(action.scripts);break;}
   case 'runValidation':{if(!current||!state.activeProject?.validationScripts?.length)throw Error('Save a validation profile first.');const scripts=state.activeProject.validationScripts;current.checkReceipts=scripts.map(script=>({id:id(),script,command:`Sample: ${script}`,status:'passed',revision:current.revision,exitCode:0,log:'Simulated check. No command was executed.',startedAt:stamp,endedAt:stamp}));current.check=current.checkReceipts.at(-1)!;current.validationRun={scripts,revision:current.revision,index:scripts.length-1,status:'passed'};break;}
   case 'queueWorkflow':{if(!current||current.id!==action.taskId)throw Error('The selected chat changed.');if(current.promptQueue?.some(q=>q.workflow?.id===action.id))break;const w=state.workflows?.find(w=>w.id===action.workflowId);if(!w)throw Error('Workflow unavailable.');const prompts=workflowPrompts(w,action.objective);if((current.promptQueue??[]).length+prompts.length>5)throw Error('Make room in the queue for all workflow phases.');for(const p of prompts)(current.promptQueue??=[]).push({id:id(),text:p.text,files:[],images:[],mode:'chat',runOptions:{...current.runOptions!,budget:p.budget},at:stamp,...(p.requiredChecks?.length?{requiredChecks:p.requiredChecks}:{}),workflow:{id:action.id,title:w.title,phase:p.title,index:p.index,total:prompts.length}});current.queuePaused=true;break;}
   case 'handoffContext':{if(!current||current.id!==action.sourceTaskId)throw Error('The selected source chat changed.');const target=tasks.get(action.targetTaskId);if(!target||target.archived||target.id===current.id)throw Error('Choose another active chat.');if(target.promptQueue?.some(q=>q.handoff?.id===action.id))break;if((target.promptQueue??[]).length>=5)throw Error('The recipient queue already holds five prompts.');const text=handoffText({title:current.title,project:state.activeProject?.name??'Sample project',text:action.text,files:action.files.map(f=>({...f,text:'Preview file snapshot'}))});(target.promptQueue??=[]).push({id:id(),text,files:[],images:[],mode:'chat',runOptions:copy(target.runOptions!),at:stamp,handoff:{id:action.id,sourceTaskId:current.id,sourceTitle:current.title}});break;}
   case 'queueMessage':if(current){if((current.promptQueue??[]).length>=5)throw Error('The queue holds up to five prompts.');if(!action.text.trim())throw Error('Enter a prompt.');const recentContext=await stagedPreviewRecentContext(current);(current.promptQueue??=[]).push({id:id(),text:action.text.trim(),files:copy(action.files??[]),images:copy(action.images??[]),mode:action.mode??'chat',runOptions:copy(action.runOptions??current.runOptions!),...(recentContext?{recentContext}:{}),at:stamp});consumePreviewRecentContext(current);current.queuePaused=true;}break;
   case 'moveQueued':if(current)current.promptQueue=moveQueuedPrompt(current,action);break;
   case 'beginQueueEdit':{queuedPrompt(current,action);current!.queuePaused=true;current!.queueHold=true;break;}
   case 'editQueued':{const edited=editQueuedPrompt(current,action);current!.promptQueue=current!.promptQueue!.map(item=>item.id===edited.id?edited:item);current!.queuePaused=true;current!.queueHold=true;break;}
   case 'sendQueued':{const next=queuedPrompt(current,action);if(['running','starting','submitting','waiting'].includes(state.runtime.status)||state.runtime.pending)throw Error('Wait for the current request to finish.');if(missingChecks(current!,current!.revision,next.requiredChecks??[]).length)throw Error('Run passing checks for this revision before this workflow phase.');if(next.recentContext)await validatePreviewRecentContext(current!,next.recentContext);current!.promptQueue=current!.promptQueue!.filter(item=>item.id!==next.id);reply(current!,next.text,next.images);current!.queuePaused=true;current!.queueHold=true;break;}
   case 'removeQueued':if(current){if(action.taskId!==undefined)queuedPrompt(current,{...action,taskId:action.taskId,expectedRevision:action.expectedRevision??-1},{allowUnknown:true});current.promptQueue=current.promptQueue?.filter(item=>item.id!==action.id);}break;
   case 'pauseQueue':if(current){current.queuePaused=true;current.queueHold=true;}break;
   case 'resumeQueue':if(current){const next=current.promptQueue?.[0];if(next){queuedPrompt(current,{taskId:current.id,id:next.id,expectedRevision:next.revision??0});if(missingChecks(current,current.revision,next.requiredChecks??[]).length)throw Error('Run passing checks for this revision before this workflow phase.');}if(next?.recentContext)await validatePreviewRecentContext(current,next.recentContext);current.promptQueue?.shift();if(next)reply(current,next.text,next.images);current.queuePaused=true;}break;
   case 'inspectChild':{const item=state.runtime.children?.items.find(i=>i.itemId===action.itemId);if(action.taskId!==state.task?.id||action.sessionId!==state.runtime.sessionId||!item?.childSessionId||item.revision!==action.revision)throw Error('The child changed. Review its latest state.');state.runtime.childInspections=[{itemId:item.itemId,revision:item.revision,sessionId:action.sessionId,childSessionId:item.childSessionId,status:'ready',readAt:'2026-10-28T12:00:00.000Z',data:{session:{sessionId:item.childSessionId,status:'notLoaded',modelId:'muse-spark-1.2',workspaceRoot:'C:/MuseBench/sample'},history:{mode:'inline',available:true,shortened:false,totalItems:3,omittedItems:0,items:[{itemId:'child-prompt',kind:'userMessage',status:'completed',text:'Review keyboard navigation.',shortened:false},{itemId:'child-tool',kind:'toolCall',status:'completed',tool:'read_file',text:'Keyboard handlers checked.',shortened:false},{itemId:'child-answer',kind:'agentMessage',status:'completed',text:'Focus returns to the disclosure button after collapse.',shortened:false}]},worktree:{worktreeRoot:'C:/MuseBench/worktrees/accessibility',baseCommit:'sample-base',headCommit:'sample-head',ownership:'runtimeOwned',cleanupPolicy:'removeIfClean',cleanupState:'retained',parentDirtyExcluded:true}}}];break;}
    case 'childControl':if(current){const receipt={commandId:id(),sessionId:action.sessionId,itemId:action.itemId,revision:action.revision,action:action.action,body:action.body,status:'accepted',at:stamp};state.runtime.childReceipts=[receipt];current.childControlReceipts=[receipt];if(['followupTask','resume','reopen','retry'].includes(action.action))state.runtime={...state.runtime,status:'running',foregroundActive:false,childrenBusy:true,childWorkPending:1};}break;
   case 'compactSession':if(current){const receipt={commandId:id(),sessionId:action.sessionId,turnId:action.turnId,status:'compacted',at:stamp,tokensBefore:24000,tokensAfter:9000};state.runtime.compaction=receipt;current.compactionReceipts=[receipt];const observation=observeCompaction({kind:'compaction',itemId:receipt.commandId,turnId:receipt.turnId,revision:1,status:'completed',outcome:'compacted',trigger:'manual',tokensBefore:receipt.tokensBefore,tokensAfter:receipt.tokensAfter},{sessionId:receipt.sessionId,source:'live',at:stamp});current.contextCompactions=mergeCompactionHistory(current.contextCompactions,[observation]);}break;
   case 'steerMessage':if(current){current.messages.push({id:id(),role:'user',text:action.text,at:stamp});state.runtime.steering={status:'accepted',commandId:id(),turnId:action.expectedTurnId};}break;
   case 'answerInput':{const requests=state.runtime.pendingRequests??(state.runtime.pending?[state.runtime.pending]:[]),p=inputPrompt(requests.find(value=>(value as {userInputId?:string}).userInputId===action.userInputId));if(!p||action.taskId!==current?.id||action.sessionId!==p.sessionId||action.userInputId!==p.userInputId||action.turnId!==p.turnId||action.revision!==p.revision)throw Error('The question changed.');validateInputAnswers(p,action);if(action.operation==='engage')break;const remaining=requests.filter(value=>(value as {userInputId?:string}).userInputId!==p.userInputId) as NonNullable<AppState['runtime']['pendingRequests']>;const receipt={status:'settled',userInputId:p.userInputId,outcome:action.operation==='cancel'?'cancelled':'answered'};state.runtime={...state.runtime,pending:remaining[0]??null,pendingRequests:remaining,status:remaining.length?'blocked':'completed',reason:remaining.length?'Simulated native question':null,inputResponse:receipt,inputResponses:[...(state.runtime.inputResponses??[]),receipt]};break;}
   case 'sendMessage':if(current){await stagedPreviewRecentContext(current);consumePreviewRecentContext(current);reply(current,action.text,action.images);if(state.runtime.transport==='msp'){state.runtime={...state.runtime,status:'running',foregroundActive:true,turnId:'preview-turn',steeringSupported:true};if(['/preview-question','/preview-questions'].includes(action.text))state.runtime={...state.runtime,status:'blocked',reason:'Simulated native question',inputResponse:null,pending:{kind:'input',sessionId:state.runtime.sessionId,userInputId:'preview-question',turnId:'preview-turn',revision:1,questions:[{id:'approach',header:'Approach',question:'Which implementation should I use?',selection:{mode:'single'},options:[{label:'Extend the existing component',description:'Keep the current architecture.'},{label:'Create a separate component'}]}]}};if(state.runtime.pending){const first=state.runtime.pending as NonNullable<AppState['runtime']['pendingRequests']>[number];state.runtime.pendingRequests=action.text==='/preview-questions'?[first,{...first,userInputId:'preview-question-two',revision:2}]:[first];}}}break;
   case 'renameTask':{if(action.id!==undefined&&(typeof action.id!=='string'||!action.id.trim()||action.id.length>200))throw Error('Invalid chat identifier.');const target=action.id===undefined?current:tasks.get(action.id);if(!target)throw Error('Chat not found.');if(target.runtimeBusy||target.id===current?.id&&(state.runtime.pending||state.runtime.operationBusy||['running','starting','submitting','connecting','checking-permissions'].includes(state.runtime.status)))throw Error('Stop this chat before editing its details.');if(typeof action.title!=='string'||!action.title.trim()||action.title.length>100)throw Error('Use a chat name up to 100 characters.');target.title=action.title.trim();target.updatedAt=new Date().toISOString();break;}
   case 'setRunOptions':if(current)current.runOptions=copy(action.runOptions);break;
   case 'setGoal':if(current)current.goal={objective:action.objective,status:action.status};break;
   case 'setMemories':state.memories=action.text;break;
   case 'setProjectInstructions':{const target=state.projects.find(p=>p.id===action.projectId);if(target)target.instructions=action.text;break;}
   case 'moveSidebarItem':{const planned=planSidebarMove(state.projects,[...tasks.values()],state.sidebarOrder,action);state.sidebarOrder=planned.orders;if(action.kind==='chat'){const target=tasks.get(action.id)!;if(action.section==='project'){target.projectId=action.projectId!;if(state.task?.id===target.id)state.activeProject=state.projects.find(p=>p.id===target.projectId)!;}if(action.section==='pinned')target.pinned=true;if(action.section==='recents')target.pinned=false;}break;}
   case 'setTaskFlags':{const target=tasks.get(action.id);if(target){if(action.pinned!==undefined)target.pinned=action.pinned;if(action.archived!==undefined){if(action.archived&&!target.archived)target.archivedAt=new Date().toISOString();if(!action.archived)target.archivedAt=null;target.archived=action.archived;}if(target.archived)target.pinned=false;}break;}
   case 'deleteTask':{if(action.allowUnarchived!==undefined&&typeof action.allowUnarchived!=='boolean')throw Error('Invalid direct-delete choice.');const target=tasks.get(action.id);if(!target)throw Error('Chat not found.');if(!target.archived&&action.allowUnarchived!==true)throw Error('Archive this chat first.');if(target.runtimeBusy||target.id===current?.id&&(state.runtime.pending||state.runtime.operationBusy||['running','starting','submitting','connecting','checking-permissions'].includes(state.runtime.status)))throw Error('Stop this chat before deleting it.');tasks.delete(action.id);if(state.task?.id===action.id)state.task=null;delete state.drafts?.[`${target.projectId}:${target.id}`];state.checkpoints=state.checkpoints.filter(item=>item.taskId!==target.id);break;}
   case 'forkTask':if(current){const index=current.messages.findIndex(m=>m.id===action.messageId&&m.role!=='system');if(index<0)throw Error('Select a sample message first.');const selected=current.messages[index],fork=copy(current);fork.id=id();fork.recentContext=undefined;fork.title=`Branch: ${current.title}`;fork.pinned=false;fork.archived=false;fork.archivedAt=null;fork.messages=fork.messages.slice(0,index+(selected.role==='assistant'?1:0)).filter(m=>m.role!=='system').map(m=>({...m,id:id()}));fork.runs=[];fork.changes=[];if(selected.role==='user')(state.drafts??={})[`${fork.projectId}:${fork.id}`]={text:selected.text,files:selected.files??[],images:selected.images??[],mode:'chat',updatedAt:new Date().toISOString()};tasks.set(fork.id,fork);state.task=fork;}break;
   case 'clearError':state.error=null;break;
   case 'refresh':break;
   case 'startPreview':state.preview={status:'running',url:location.origin+'/preview-project.html',log:'Browser sample preview. No package script or model request ran.',script:action.script};break;
   case 'stopPreview':state.preview={status:'stopped',url:null,log:'',script:null};break;
   default:return desktop();
  }
  if(state.task?.id!==current?.id){if(current)runtimeOwners.set(current.id,previousRuntime);state.runtime=copy(runtimeOwners.get(state.task?.id??'')??runtime);}
  return sync();
 }
 const personal:PersonalState={profile:{displayName:'Alex Morgan',avatarSeed:'musebench-sample-account',sample:true},destination:'chat',loading:false,origin:'',error:null,canGoBack:false,canGoForward:false,visible:false,available:{bot:true,chat:true,ideas:true,goals:true},compact:true,notice:null,authenticating:false,authWindowOpen:false,library:{selectedId:'sample-chat',chats:{status:'ready',items:[{id:'sample-main',kind:'chat',title:'Main conversation',main:true},{id:'sample-chat',kind:'chat',title:'Plan a thoughtful week'},{id:'sample-notes',kind:'chat',title:'Turn notes into next steps'}]},ideas:{status:'ready',items:[{id:'sample-idea',kind:'idea',title:'A calmer morning routine'}]},goals:{status:'ready',items:[{id:'sample-goal',kind:'goal',title:'Build a habit of learning'}]}}};
 const person=channel(()=>personal);
 function applySnapshot(){const {key,snapshot}=selectedSnapshot();personal.schedules=key==='scheduled'?copy(snapshot?.personal?.schedules??{status:'unavailable',items:[]}):null;if(snapshot?.personal){personal.agentProfile=copy(snapshot.personal.agentProfile);personal.library=copy(snapshot.personal.library);personal.library.chats.items=personal.library.chats.items.map(item=>({...item,...(item.title==='Main conversation'?{main:true}:{})}));}person.emit();}
 subscribeSnapshots(applySnapshot);void loadSnapshots();
 const workItems:WorkItem[]=[{id:'sample-work',title:'Weekly operations brief',team:'operations',kind:'document',projectId:'sample-work-project',taskId:'sample-work-task',createdAt:stamp,updatedAt:stamp,sources:[],demo:true}];
 const workTasks=new Map([['sample-work',task('Summarize our weekly priorities','sample-work-task','sample-work-project')]]);
 const artifacts=new Map([['sample-work',demoArtifact('document','operations')]]);
 const work:WorkState={items:workItems,activeId:null,item:null,task:null,runtime:copy(runtime),busy:false,error:null,artifact:null,artifactError:null,artifactUpdatedAt:null,capabilities:{mp4:false}};
 const workChannel=channel(()=>work);
 function selectWork(key:string){work.item=workItems.find(i=>i.id===key)??null;work.activeId=work.item?.id??null;work.task=workTasks.get(key)??null;work.artifact=artifacts.get(key)??null;work.artifactUpdatedAt=stamp;}
 const spaces:SpacesState={spaces:[{id:'sample-space',spaceId:'sample-space',name:'Design studio',url:'',local:true}],activeId:null,snapshot:null,page:null,comments:[],history:[],error:null,conflict:false,busy:false,lastSynced:stamp,invitation:null,hosting:null};
 const pages:SpacePage[]=[{id:'sample-page',title:'Welcome to the studio',type:'note',revision:1,updatedAt:stamp,updatedBy:'Preview member',body:'# A place to work together\n\nKeep project notes, ideas, and decisions in one shared space.\n\n- Agree on the next milestone\n- Share a useful draft\n- Leave focused feedback'}];
 const spaceChannel=channel(()=>spaces);
 function selectSpace(){spaces.activeId='sample-space';spaces.snapshot={space:{id:'sample-space',name:'Design studio',description:'A fictional shared workspace',createdAt:stamp},self:{id:'preview-member',name:'Preview member',role:'owner',joinedAt:stamp},members:[{id:'preview-member',name:'Preview member',role:'owner',joinedAt:stamp}],pages,invites:[]};spaces.page=pages[0];}
 const site:SiteItem={id:'sample-site',title:'Studio notes',description:'A simple home for your next idea.',slug:'studio-notes',createdAt:stamp,updatedAt:stamp,source:'starter',draftHash:'sample',liveVersionId:null,url:null,remoteId:null,remoteName:null,status:'draft'};
 const siteFiles:Record<string,string>={'index.html':'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10%;font:18px system-ui;background:#101b2c;color:#e6efff}small{color:#79afff}h1{font-size:clamp(30px,6vw,64px);line-height:1.1;max-width:650px}p{max-width:480px;line-height:1.6}</style></head><body><small>STUDIO NOTES · SAMPLE SITE</small><h1>Make room for your next idea.</h1><p>A quiet place to share the things you are building. This is a local preview, not a published website.</p></body></html>'};
 const setupPreview=typeof location!=='undefined'&&new URLSearchParams(location.search).has('setup');
 const onboardingState:OnboardingState={simulation:true,code:{status:setupPreview?'required':'ready'},personal:{status:setupPreview?'required':'ready'}};
 const billingListeners=new Set<()=>void>();
 const billingState:CodeBillingState={mode:'account',source:'account',status:'ready',hasApiKey:false,billingAccountId:null,busy:false,simulation:true};
 const billingEmit=()=>billingListeners.forEach(fn=>fn());
 const sites:SitesState={items:[site],activeId:null,site:null,files:[],versions:[],previewUrl:null,hosting:{connected:false,accountName:null,teams:[],teamId:null,oauthAvailable:false,authPending:false},busy:false,operation:null,error:null,notice:null,generation:null};
 const siteChannel=channel(()=>sites);
 function selectSite(key:string){sites.site=sites.items.find(i=>i.id===key)??site;sites.activeId=sites.site.id;sites.files=Object.entries(siteFiles).map(([path,text])=>({path,bytes:new TextEncoder().encode(text).length,sha1:'sample',mime:'text/html'}));sites.previewUrl=`data:text/html;charset=utf-8,${encodeURIComponent(siteFiles['index.html'])}`;}
 const hookPresets=createPreviewHookPresets();
 const pluginToolReviews=new Map<string,boolean>();
 let pluginToolRevision=0;
 const hookProjects=new Map<string,NonNullable<CustomizeState['hooks']>>();
 const reviewedInstructionRoots=new Set<string>();
 const reviewedProjectMcpRoots=new Set<string>();
 const inspectedProjectMcpRoots=new Set<string>();
 const previewInstructionText='Preview sample: keep shared desktop and browser controls in sync.';
 const customize:CustomizeState={simulation:true,available:true,errors:[],pluginsReviewed:true,pluginRevision:'sample',skills:[{id:'sample-skill',title:'Clear project notes',description:'Turn a rough brief into a useful implementation outline.',scope:'user',activation:'user-only',contextCost:{startupBytes:0,startupTokens:0,invokeBytes:2080,invokeTokens:520},diagnostics:[]}],skillCatalog:{diagnostics:[],omitted:0},plugins:[{id:'preview-tools',title:'Preview tools',description:'A simulated plugin for reviewing tool access.',version:'Preview',enabled:true,valid:true,capabilities:[{kind:'mcp_servers',count:1}],reviewRequired:false}],servers:[]};
 const updateListeners=new Set<(state:import('../shared/types').AppUpdateState)=>void>();
 let appUpdate:import('../shared/types').AppUpdateState={version:'0.2.0',status:'idle',availableVersion:null,downloadedVersion:null,releaseNotes:'',releaseDate:null,blockers:[],percent:0,lastChecked:null,error:null,simulation:true};
 const updateEmit=(patch:Partial<typeof appUpdate>)=>{appUpdate={...appUpdate,...patch};updateListeners.forEach(fn=>fn(copy(appUpdate)));};
 const dictation={id:null,status:'idle' as const,available:false,language:null,text:'',error:'Microphone input is available in the desktop app.'};
 let mobile:import('../shared/mobile-types').MobileDeviceState={running:false,port:null,name:'Preview desktop',addresses:[],devices:[],pairing:null,simulation:true};
 let nativeEnabled=false,backgroundEnabled=false;
 const integrationPanels=createPreviewIntegrationPanels(customize,()=>JSON.stringify([state.activeProject?.id,state.activeProject?.root,state.task?.id]),()=>customizeBlocked(state));
 return {
  nativeControl:async command=>{if(command.type==='enable')nativeEnabled=true;if(command.type==='disable')nativeEnabled=false;return{enabled:nativeEnabled,running:nativeEnabled,transport:'stdio',scope:'Preview',simulation:true,connectionConfig:null};},
  backgroundEngine:async command=>{if(command.type==='set')backgroundEnabled=command.enabled;return{enabled:backgroundEnabled,running:true,windowOpen:true,simulation:true};},
  mobileDevice:async command=>{if(command.type==='start')mobile={...mobile,running:true,port:43191,addresses:['192.168.1.10']};if(command.type==='stop')mobile={...mobile,running:false,pairing:null,addresses:[]};if(command.type==='pair')mobile={...mobile,pairing:{link:'Preview only — pair from the installed desktop app.',expiresAt:Date.now()+600000}};if(command.type==='revoke')mobile={...mobile,devices:mobile.devices.filter(d=>d.id!==command.id)};return copy(mobile);},
  codeBilling:async command=>{if(command.type==='checkout')return{opened:false,simulation:true};if(command.type==='saveApiKey'){if(command.key.length<10)throw Error('Enter a valid API key.');billingState.hasApiKey=true;billingState.mode='api';billingState.source='api';billingState.billingAccountId=null;}if(command.type==='select'){if(command.source==='api'&&!billingState.hasApiKey)throw Error('Add a Meta API key first.');billingState.mode=command.source;billingState.source=command.source;}if(command.type==='linkBilling')billingState.billingAccountId=command.accountId;if(command.type!=='status')billingEmit();return{state:copy(billingState)};},
  onBillingChanged:callback=>{billingListeners.add(callback);return()=>{billingListeners.delete(callback);};},
  appUpdate:async command=>{if(command==='check'&&appUpdate.status!=='downloaded')updateEmit({status:'available',availableVersion:'0.2.1',downloadedVersion:null,releaseNotes:'Preview example\n\nClearer update details, compact connection diagnostics, and subtle Muse blue accents.',releaseDate:'2026-10-29T12:00:00Z',lastChecked:'2026-10-29T12:00:00Z',error:null});if(command==='download'&&appUpdate.status==='available'){updateEmit({status:'downloading',percent:45});await new Promise(r=>setTimeout(r,400));updateEmit({status:'downloaded',downloadedVersion:'0.2.1',percent:100});}if(command==='install'&&appUpdate.status==='downloaded')updateEmit({error:'Preview only. The desktop app would install and reopen.'});return copy(appUpdate);},
  onAppUpdate:fn=>{updateListeners.add(fn);return()=>{updateListeners.delete(fn);};},
  windowControlsOverlay:true,
  inspectWorktrees:async input=>({root:state.projects.find(p=>p.id===input.projectId)?.root??project.root,branch:'main',head:'sample-base',dirty:true,items:copy(sampleWorktrees)}),
  inspectProjectActions:async input=>copy(projectActionView(input)),
  ...createBrowserPreviewAnnotations({getState:()=>state}),
  inspectRunChanges:async input=>copy(runChangeView(input)),
  prepareRunFeedback:async input=>{input=validateRunFeedback(input);const view=runChangeView(input),file=view.files.find(file=>file.path===input.path);if(!file||input.revision!==view.revision||input.end>sourceLineCount(file[input.side]))throw Error('Choose captured lines in this sample.');return{text:'Sample review feedback for '+JSON.stringify(input.path)+' · '+input.side+' lines '+input.start+'–'+input.end+'\n\n'+input.note};},
  importCodeImage:async input=>{const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(input.dataUrl);if(!match||input.dataUrl.length>11200000)throw Error('Choose an image up to 8 MB.');const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');imageData.set(input.projectId+id,input.dataUrl);return{id,name:input.name,mime:match[1],bytes:bytes.length};},
  readCodeImage:async input=>{const data=imageData.get(input.projectId+input.image.id);if(!data)throw Error('Screenshot unavailable');return data;},
  getState:code.read,onState:code.on,dispatch,openProjectFile:desktop,chooseProject:desktop,chooseBinary:desktop,openExternal:async(url:string)=>{const u=new URL(url);const catalogLink=CURATED_EXTENSIONS.some(item=>item.homepage===u.href||item.provenance.url===u.href);if(u.protocol!=='https:'||u.username||u.password||(!catalogLink&&(u.origin!=='https://www.google.com'||u.pathname!=='/search'||!u.searchParams.get('q'))))return desktop();window.open(u.href,'_blank','noopener,noreferrer');},
  configureNotifications:async()=>({supported:false}),dictation:async command=>{if(['status','refresh','cancel','stop'].includes(command))return copy(dictation);return desktop();},onDictation:()=>()=>{},
  saveCodeDraft:async input=>{state.drafts![`${input.projectId}:${input.taskId??'new'}`]={text:input.text,files:copy(input.files),images:copy(input.images??[]),mode:input.mode};},
  inspectCheckpoint:async input=>{if(!tasks.has(input.taskId))throw Error('Chat not found.');return{revision:'sample-after',files:copy(initial.changes).map(f=>({...f,restorable:!f.binary})),operations:[]};},
  semanticNavigate:async input=>{if(input.projectId!==state.activeProject?.id)throw Error('Choose the current project.');return {operation:input.operation,path:input.path,line:input.line,column:input.column,items:input.operation==='hover'?[]:[{path:'src/ProjectOverview.tsx',line:1,column:17,endLine:1,endColumn:32}],hover:input.operation==='hover'?{path:input.path,line:input.line,column:input.column,endLine:input.line,endColumn:input.column+15,display:'function ProjectOverview(): JSX.Element',documentation:'Preview sample component.'}:null,truncated:false,snapshot:'preview-sample',scope:{files:2,bytes:500,entries:2,skipped:{symlinks:0,directories:0},config:'fixed-no-project-config',standardLibrary:false,excludedDirectories:['node_modules','.*']},engine:'Preview sample · no source files read',elapsedMs:0};},
  readCapturedOutput:async input=>{if(!tasks.has(input.taskId))throw Error('Chat not found.');const body='Sample validation output. No command was executed.\n\nsrc/app.ts(12,3): error TS2322: Example type diagnostic\n'+'Example output line\n'.repeat(4000)+'Capture complete.\n';const item={id:'sample-output',label:'Sample: npm test',status:'failed',received:body.length,length:body.length,captureTruncated:false,sourceTruncated:false};const match=input.query?literalIndex(body,input.query,input.offset??0):-1,offset=match>=0?Math.max(0,match-80):Math.min(input.offset??0,body.length);return{items:[item],selected:input.id?{...item,text:body.slice(offset,offset+12000),offset,match:input.query?match:null}:null};},
  ...imports,
  readChatHistory:async input=>{if(imports.has(input.taskId))return imports.readHistory(input);const t=tasks.get(input.taskId);if(!t)throw Error('Chat not found.');let messages=t.messages;const end=input.before?messages.findIndex(m=>m.id===input.before):messages.length;if(end<0)throw Error('Invalid history cursor.');messages=input.messageId?messages.filter(m=>m.id===input.messageId):messages.slice(Math.max(0,end-(input.limit??20)),end);const offset=input.offset??0;return copy({messages:messages.map(m=>({...m,text:m.text.slice(offset,offset+12000),textLength:m.text.length,offset})),total:t.messages.length,before:!input.messageId&&end>messages.length?messages[0]?.id??null:null,coverage:'preview-sample'});},
  searchChats:async input=>copy([...imports.search(input.query),...[...tasks.values()].filter(t=>input.includeArchived||!t.archived).flatMap(t=>{const needle=input.query.toLowerCase(),m=t.messages.find(m=>m.role!=='system'&&m.text.toLowerCase().includes(needle));if(needle&&!m&&!t.title.toLowerCase().includes(needle)&&!project.name.toLowerCase().includes(needle))return[];return[{...t,projectName:project.name,snippet:m?.text??t.title,messageId:m?.id,at:m?.at}];})]),
  inspectDiscoverySources:async input=>{if(input.taskId!==state.task?.id)throw Error('The selected chat changed.');discoveryReviewOwner=input.taskId;return{ownerId:input.taskId,root:state.activeProject?.root??project.root,rows:[{...discoveryFixture,cwd:state.activeProject?.root??project.root},{...remoteDiscoveryFixture,cwd:state.activeProject?.root??project.root},{...discoveryFixture,cwd:project.root,id:'global:direct',name:'Enabled direct source',eligible:false,reason:'Disable its direct connection in Customize first.'}]};},
  readMcpServers:async input=>{if(input.taskId!==state.task?.id||input.sessionId!==state.runtime.sessionId||state.runtime.transport!=='msp'||!state.runtime.permissionVerified)throw Error('Connect this chat to an interactive Muse session first.');return {sessionId:input.sessionId,readAt:new Date().toISOString(),simulation:true,omitted:0,servers:[{name:'musebench_workspace',source:'session',transport:'stdio',oauth:'notSupported'},{name:'Documentation',source:'settings',transport:'streamableHttp',oauth:'loggedOut'}]};},
  inspectCodeContext:async input=>{const recentContext=await stagedPreviewRecentContext(tasks.get(input.taskId??''));const context=composeChatContext({recentContext,task:tasks.get(input.taskId??''),project:state.activeProject,memories:state.memories,text:input.text,attachments:[],history:!tasks.get(input.taskId??'')?.nativeSession?.seeded,nativeSession:!!tasks.get(input.taskId??'')?.nativeSession?.seeded});const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');return{...context,receipt:{version:1,promptHash:await digest(context.prompt),revision:'sample-after',historyMode:context.historyMode,nativeContext:'unknown',...(context.recentContext?{recentContext:context.recentContext}:{}),messages:context.includedSources,sources:[],instructions:{personal:state.memories?await digest(state.memories):null,project:state.activeProject?.instructions?await digest(state.activeProject.instructions):null},characters:context.characters},attachments:[],files:[]};},
  analytics:async options=>sampleAnalytics(options),
  commandInfo:async type=>{if(type==='skills')return {status:'ready',skills:[{id:'sample-skill',name:'clear-project-notes',title:'Clear project notes',description:'Sample skill',scope:'Personal',available:true},...['plan','grill','browser-app-delivery','git','create-skill','workflow-authoring'].map(name=>({id:`bundled:${name}`,name,title:name,description:'Bundled Muse skill. This preview shows catalog data without running Muse.',scope:'Bundled',activation:'on',source:`bundled://muse-core/skills/${name}/SKILL.md`,available:true})),{id:'project:sample',name:'project-sample',title:'Project skill example',description:'A project skill requiring workspace trust.',scope:'Project',available:false,unavailableReason:'Project skill trust is not supported by this connection'}]};if(type==='billing')return {status:'ready'};if(type==='usage')return {status:'ready',usage:{simulation:true,billingSource:billingState.source,billingMatched:billingState.billingAccountId==='preview-team',observedAt:new Date(usageObservedAt).toISOString(),windows:[{label:'5-hour window',remainingPercent:64,resetsAt:sampleResetAt},{label:'Weekly',remainingPercent:9,resetsAt:sampleWeeklyResetAt}],billing:{accountId:'preview-team',spent:18.25,currentBalance:2.50,freeCredits:125,paymentThreshold:20,currency:'USD',period:'This month',alertLimit:100,source:'Meta billing (sample)'}}};return desktop();},
  onboarding:async command=>{if(command.type==='loginCode'||command.type==='apiKey')onboardingState.code={status:'ready',message:'Preview sign-in complete. No credentials were used.'};if(command.type==='loginPersonal')onboardingState.personal={status:'ready',message:'Preview sign-in complete.'};return copy(onboardingState);},
  personalState:person.read,onPersonalState:person.on,onPersonalShortcut:()=>()=>{},personal:async command=>{
   if(command.type==='prewarm'){prewarmSnapshot(command.target);return copy(personal);}
   personal.error=null;
   switch(command.type){
    case 'navigate':personal.notice=null;personal.destination=command.destination;personal.library.selectedId=null;selectSnapshot(command.destination);break;
    case 'metaAction':personal.destination='chat';personal.notice=null;selectSnapshot(command.action==='newChat'?'chat':command.action as SnapshotKey);break;
    case 'scheduleAction':personal.notice='This is a read-only desktop snapshot. Use the desktop app to create, edit, or delete real scheduled tasks.';break;
    case 'selectItem':{personal.notice='This snapshot shows the captured page. Open individual account items in the desktop app.';const found=[...personal.library.chats.items,...personal.library.ideas.items,...personal.library.goals.items].find(i=>i.id===command.id);if(found?.main)selectSnapshot('bot');personal.library.selectedId=command.id;personal.destination=found?.kind==='idea'?'ideas':found?.kind==='goal'?'goals':'bot';break;}
    case 'newMuseChat':personal.destination='bot';personal.library.selectedId=null;personal.notice='Use the desktop app to start a real Muse chat.';selectSnapshot('bot');break;
    case 'layout':personal.visible=command.visible;return copy(personal);
    case 'appearance':personal.appearance=copy(command.appearance);break;
    case 'presentation':personal.compact=command.compact;break;
    case 'dismissNotice':personal.notice=null;break;
    case 'reload':case 'refreshLibrary':await loadSnapshots();break;
    default:personal.notice='Account services are available in the MuseBench desktop app. This preview is not signed in.';
   }
   return person.emit();
  },
  workState:workChannel.read,onWorkState:workChannel.on,workImport:desktop,workExport:desktop,work:async command=>{
   switch(command.type){
    case 'select':selectWork(command.id);break;
    case 'create':{const key=id();const next:WorkItem={id:key,title:command.title,team:command.team,kind:command.kind,projectId:key,taskId:key,createdAt:stamp,updatedAt:stamp,sources:[],demo:true};workItems.unshift(next);workTasks.set(key,task(command.brief||command.title,key,key));artifacts.set(key,demoArtifact(command.kind,command.team));selectWork(key);break;}
    case 'send':if(work.task)reply(work.task,command.text);break;
    case 'saveArtifact':if(work.activeId){const validated=validateArtifact(command.artifact);artifacts.set(work.activeId,validated);work.artifact=copy(validated);}break;
    case 'clearError':work.error=null;break;
    case 'refresh':case 'stop':break;
   }
   return workChannel.emit();
  },
  spacesState:spaceChannel.read,onSpacesState:spaceChannel.on,spacesCopyInvitation:desktop,spaces:async command=>{
   switch(command.type){
    case 'select':selectSpace();break;
    case 'openPage':spaces.page=pages.find(p=>p.id===command.pageId)??null;break;
    case 'savePage':{let page=pages.find(p=>p.id===command.pageId);if(!page){page={id:id(),title:command.title,type:'note',revision:0,updatedAt:stamp,updatedBy:'Preview member'};pages.push(page);}page.title=command.title;page.body=command.body;page.revision++;spaces.page=page;break;}
    case 'comment':spaces.comments.push({id:id(),text:command.text,by:'Preview member',createdAt:stamp,resolved:false,canResolve:true});break;
    case 'resolveComment':{const comment=spaces.comments.find(c=>c.id===command.commentId);if(comment)comment.resolved=command.resolved;break;}
    case 'refresh':case 'clearInvitation':case 'clearError':spaces.error=null;break;
    default:return desktop();
   }
   return spaceChannel.emit();
  },
  sitesState:siteChannel.read,onSitesState:siteChannel.on,sitesImport:desktop,sitesConnect:desktop,sitesAuthPoll:siteChannel.read,sitesOpen:desktop,sitesCopyUrl:desktop,sitesReadFile:async file=>{if(!Object.hasOwn(siteFiles,file))throw Error('This sample file is not available.');return {text:siteFiles[file]};},sites:async command=>{
   switch(command.type){
    case 'select':selectSite(command.id);break;
    case 'saveFile':siteFiles[command.path]=command.text;selectSite(sites.activeId??site.id);break;
    case 'update':if(sites.site)Object.assign(sites.site,{title:command.title,description:command.description,slug:command.slug});break;
    case 'saveVersion':sites.versions.push({id:id(),number:sites.versions.length+1,label:command.label||'Sample version',createdAt:stamp,hash:'sample',fileCount:sites.files.length,bytes:sites.files.reduce((sum,file)=>sum+file.bytes,0),deployId:null,status:'saved'});break;
    case 'refresh':case 'clearError':sites.error=null;break;
    default:return desktop();
   }
   return siteChannel.emit();
  },
  customize:async command=>{
   const panelResult=integrationPanels(command);if(panelResult)return panelResult;
   if(command.type==='inspectPluginMcp'||command.type==='pluginMcpAction'){
    const plugin=customize.plugins.find(item=>item.id===command.id);if(!plugin)throw Error('Sample plugin not found.');
    const stableId='plugin:'+plugin.id+':mcp_server:local-notes',hookId='plugin:'+plugin.id+':hook:on-stop',importedId='plugin:'+plugin.id+':hook:imported-check';
    if(command.type==='pluginMcpAction'){
     if(!command.reviewed||command.revision!=='preview-tools-'+pluginToolRevision||plugin.id!=='preview-tools'||![stableId,hookId,importedId].includes(command.stableId))throw Error('Plugin capabilities changed after review.');
     if(command.action==='approve'&&!plugin.enabled)throw Error('Enable this plugin first.');
     pluginToolReviews.set(command.stableId,command.action==='approve');pluginToolRevision++;
    }
    const access=(id:string)=>{const enabled=pluginToolReviews.get(id)===true;return{enabled,reviewed:enabled,status:enabled?'trusted_enabled':pluginToolReviews.has(id)?'trusted_disabled':'needs_approval'};};
    return{pluginMcp:{simulation:true,id:plugin.id,revision:'preview-tools-'+pluginToolRevision,enabled:plugin.enabled,inventoryReviewed:true,servers:plugin.id==='preview-tools'?[
     {stableId,title:'local-notes',kind:'mcp_server',supported:true,command:['node','sample-notes.mjs'],definitionHash:'Preview definition',...access(stableId)},
     {stableId:hookId,title:'on-stop',kind:'hook',supported:true,command:['node','sample-stop.mjs'],definitionHash:'Preview hook definition',hook:{event:'Stop',timeoutMs:3000,async:false,matcher:null,compatibilityName:null},...access(hookId)},
     {stableId:importedId,title:'imported-check',kind:'hook',supported:true,command:['node "$CLAUDE_PLUGIN_ROOT/hooks/check.mjs" && echo done'],definitionHash:'Preview imported definition',hook:{event:'PreToolUse',timeoutMs:3000,async:false,matcher:'Bash|Read',compatibilityName:null,execution:'shell',source:'hooks/hooks.json',ignoredSilent:true},...access(importedId)},
    ]:[]},...(command.type==='pluginMcpAction'?{state:copy(customize),message:'Preview only: plugin access decision simulated. No program ran.'}:{})};
   }
   if(command.type==='inspectProjectMcp'||command.type==='approveProjectMcp'||command.type==='revokeProjectMcp'){
    const root=state.activeProject?.root??project.root;
    inspectedProjectMcpRoots.add(root);
    if(command.type!=='inspectProjectMcp'&&command.root!==root)throw Error('The selected project changed.');
    if(command.type==='approveProjectMcp'){if(!command.reviewed||command.revision!=='preview-project-mcp')throw Error('Project MCP configuration changed after review.');reviewedProjectMcpRoots.add(root);}
    if(command.type==='revokeProjectMcp')reviewedProjectMcpRoots.delete(root);
    return{projectMcp:{simulation:true,root,boundary:root,present:true,revision:'preview-project-mcp',reviewed:reviewedProjectMcpRoots.has(root),sources:[{path:root+'/.mcp.json',revision:'Preview source hash',bytes:188}],instructions:[{path:'AGENTS.md',text:'Read files before making changes.'}],servers:[{name:'project-docs',transport:'stdio',address:'node',args:['local-docs.mjs'],cwd:null,environmentKeys:['ACCESS_TOKEN'],headerKeys:[],enabled:true,required:false,framing:'auto',startupTimeout:30,toolTimeout:300,toolFiltersPresent:false}]},...(command.type==='inspectProjectMcp'?{}:{message:'Preview only: project server access simulated. No configuration or native trust changed.'})};
   }
   if(command.type==='inspectProject'){
    const root=state.activeProject?.root??project.root,hasMcp=inspectedProjectMcpRoots.has(root),text=hasMcp?'Read files before making changes.':previewInstructionText,bytes=new TextEncoder().encode(text).length;
    return{projectInstructions:{simulation:true,root,checkedAt:new Date().toISOString(),boundary:{kind:'git',root},selectedCount:1,selectedBytes:bytes,measuredBytes:bytes,complete:true,trust:{status:(hasMcp?reviewedProjectMcpRoots:reviewedInstructionRoots).has(root)?'reviewed':'required',...(hasMcp?{source:'projectMcp' as const}:{})},levels:[{root,files:[{path:'AGENTS.md',selected:true,bytes,text}]}]}};
   }
   if(command.type==='catalogSearch'){
    const fixtures:CatalogEntry[]=command.source==='community'?[...await communityCatalog(command.kind),{id:'preview-validation-failure',title:'Unsupported package sample',description:'A deterministic validation failure for preview review.',kind:command.kind,source:'community',publisher:'Preview fixture',homepage:'https://github.com/FahadArfin/MuseBench',compatibility:'unverified',setup:'Preparation demonstrates a rejected unsupported capability.',tags:[],package:{repo:'https://github.com/FahadArfin/MuseBench',path:'.',kind:command.kind==='skills'?'skill':'plugin'},provenance:{source:'Simulated fixture',url:'https://github.com/FahadArfin/MuseBench'}}]:CURATED_EXTENSIONS.filter(item=>item.kind===command.kind);
    const entries=fixtures.filter(item=>[item.title,item.description,item.publisher,item.summary,item.category,...item.tags].join(' ').toLowerCase().includes(command.query.toLowerCase())),offset=Number(command.cursor??0),limit=command.source==='community'?30:6;
    if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid preview cursor.');
    return{catalog:{entries:copy(entries.slice(offset,offset+limit)),nextCursor:offset+limit<entries.length?String(offset+limit):null,stale:false,offline:false,fetchedAt:stamp,errors:[],disclosure:'Public directory snapshot, captured October 28, 2026. Search covers the complete snapshot. Installation and connections are simulated in this preview.'}};
   }
   if(command.type==='prepareCatalog'){
    if(command.id==='preview-validation-failure')throw Error('Preview validation rejected: unsupported executable capability. Nothing installed.');
    const item=await resolveCatalog(command.id.replace(/^preview-community:/,''));if(!item?.package)throw Error('This entry requires manual setup.');
    return{prepared:{token:'catalog:'+item.id,kind:item.package.kind==='skill'?'skills':'plugins',title:item.title,folder:'Preview staging / '+item.id,fingerprint:'Simulated content hash',instructions:'Simulated package review. Inspect the source, dependencies and permissions before installing a real package.',files:['SKILL.md','LICENSE'],capabilities:[]}};
   }
   if(command.type==='catalogServer'){
    const item=CURATED_EXTENSIONS.find(item=>item.id===command.id.replace(/^preview-community:/,''));if(!item?.recipe||!command.reviewed)throw Error('Review this server first.');
    if(customize.servers.some(server=>server.name===item.recipe!.name))throw Error('Server already configured. Manage it from Installed.');
    customize.servers.push({name:item.recipe.name,revision:'preview-'+item.id,transport:item.recipe.transport==='npm'?'stdio':'streamable_http',address:item.recipe.transport==='npm'?`Pinned npm launcher: ${item.recipe.package}@${item.recipe.version}`:item.recipe.url,enabled:true,reviewed:true,oauth:item.recipe.transport==='http'&&!!item.recipe.oauth});return{state:copy(customize),message:'Simulated server configuration saved. Sign-in and readiness are not verified.'};
   }
   if(command.type==='install'&&command.token.startsWith('catalog:')){
    const item=await resolveCatalog(command.token.slice('catalog:'.length));if(!item?.package||!command.reviewed)throw Error('Review the package first.');
    if(item.package.kind==='skill'){if(!customize.skills.some(skill=>skill.id===item.id))customize.skills.push({id:item.id,title:item.title,description:item.description,scope:'user',activation:'user-only'});}
    else if(!customize.plugins.some(plugin=>plugin.id===item.id))customize.plugins.push({id:item.id,title:item.title,description:item.description,version:'Preview',enabled:false,valid:true,capabilities:[],reviewRequired:true});
    return{state:copy(customize),message:'Preview only: package installation simulated.'};
   }
   if(command.type==='serverAction'){
    const server=customize.servers.find(item=>item.name===command.name);if(!server)throw Error('Sample server not found.');
    if(command.revision!==server.revision)throw Error('Server configuration changed after review.');
    if(command.action==='login')return{state:copy(customize),message:'Simulated sign-in handoff. No account authenticated; readiness remains unverified.'};
    if(command.action==='remove')customize.servers=customize.servers.filter(item=>item!==server);
    if(command.action==='enable'||command.action==='disable')server.enabled=command.action==='enable';
    if(command.action==='review')server.reviewed=true;
    server.revision=id();
    return{state:copy(customize),message:'Preview only: server action simulated.'};
   }
   if(command.type==='pluginAction'){
    const plugin=customize.plugins.find(item=>item.id===command.id);if(!plugin)throw Error('Sample plugin not found.');
    if(command.action==='remove')customize.plugins=customize.plugins.filter(item=>item!==plugin);else plugin.enabled=command.action==='enable';
    return{state:copy(customize),message:'Preview only: plugin action simulated.'};
   }

   customize.hookPresets=await hookPresets.snapshot();
   if(command.type==='saveHookPreset'||command.type==='deleteHookPreset'){customize.hookPresets=(await hookPresets.dispatch(command))!;return{state:copy(customize),message:'Preview hook preset saved. Project hooks unchanged.'};}
   const hookRoot=state.activeProject?.root;if(hookRoot&&!hookProjects.has(hookRoot))hookProjects.set(hookRoot,{root:hookRoot,revision:'preview-hooks',items:[]});customize.hooks=hookRoot?hookProjects.get(hookRoot):null;
   if(command.type==='saveHooks'){if(command.root!==state.activeProject?.root||command.revision!==customize.hooks?.revision||!command.reviewed)throw Error('Project hooks changed. Refresh and review again.');customize.hooks={root:command.root,revision:id(),items:validateHooks(command.hooks)};hookProjects.set(command.root,customize.hooks);return{state:copy(customize),message:'Sample project hooks saved. No commands run in preview.'};}
   if(command.type==='reviewProject'||command.type==='approveProject'||command.type==='revokeProject'){
    const root=state.activeProject?.root??project.root;
    if(command.type!=='reviewProject'&&command.root!==root)throw Error('The selected project changed.');
    if(command.type==='approveProject'){if(!command.reviewed||command.fingerprint!=='Preview sample')throw Error('Review the current sample first.');reviewedInstructionRoots.add(root);}
    if(command.type==='revokeProject')reviewedInstructionRoots.delete(root);
    return{state:copy(customize),projectReview:{root,fingerprint:'Preview sample',reviewed:reviewedInstructionRoots.has(root),files:[{path:'AGENTS.md',text:previewInstructionText}]}};
   }
   if(command.type==='preparePackSkill'){
    const item=MUSEBENCH_SKILL_PACK.find(item=>item.id===command.id);if(!item)throw Error('Unknown skill.');
    const instructions=({'musebench-ui-parity':uiSkill,'musebench-runtime-check':runtimeSkill,'musebench-release-check':releaseSkill} as Record<string,string>)[item.id];
    return {state:copy(customize),prepared:{token:item.id,kind:'skills',title:item.title,folder:'Preview / '+item.id,fingerprint:'Preview sample — no installed files',instructions,files:['SKILL.md'],capabilities:[]}};
   }
   if(command.type==='install'){
    const item=MUSEBENCH_SKILL_PACK.find(item=>item.id===command.token);if(!item||!command.reviewed)throw Error('Review the skill first.');
    if(!customize.skills.some(skill=>skill.id===item.id))customize.skills.push({id:item.id,title:item.title,description:'Optional MuseBench project reference',scope:'user',activation:'user-only'});
    customize.skillImports=[...(customize.skillImports??[]),{title:item.title,folder:'Preview / '+item.id,fingerprint:'Preview sample — no installed files',at:stamp}];
    return {state:copy(customize),message:'Preview only: skill installation simulated.'};
   }
   if(command.type==='createSkill')customize.skills.push({id:id(),title:command.name,description:command.description,scope:'user',activation:'user-only'});
   else if(command.type==='skillActivation'){const skill=customize.skills.find(s=>s.id===command.id);if(skill){skill.activation=command.activation;if(skill.id==='sample-skill')skill.contextCost={startupBytes:command.activation==='on'?288:0,startupTokens:command.activation==='on'?72:0,invokeBytes:2080,invokeTokens:520};}}
   else if(command.type!=='refresh')return desktop();
   return {state:copy(customize)};
  },
 };
}
