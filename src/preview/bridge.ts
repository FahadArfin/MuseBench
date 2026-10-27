import {validateCheckScripts,missingChecks} from '../shared/validation.mjs';
import {validateHooks} from '../shared/native-hooks.mjs';
import uiSkill from '../../templates/musebench-skills/musebench-ui-parity/SKILL.md?raw';
import runtimeSkill from '../../templates/musebench-skills/musebench-runtime-check/SKILL.md?raw';
import releaseSkill from '../../templates/musebench-skills/musebench-release-check/SKILL.md?raw';
import {MUSEBENCH_SKILL_PACK} from '../shared/skill-pack.mjs';
import {DEFAULT_WORKFLOWS,validateWorkflow,workflowPrompts} from '../shared/workflows.mjs';
import {handoffText} from '../shared/context-handoff.mjs';
import {moveQueuedPrompt} from '../shared/queued-prompts.mjs';
import {loadSnapshots,selectSnapshot,selectedSnapshot,subscribeSnapshots,type SnapshotKey} from './snapshots';
import {planSidebarMove} from '../shared/sidebar-order.mjs';
import {projectDetails} from '../shared/create-project.mjs';
import type {Action,AppState,MuseBenchBridge,PersonalState,Task,RuntimeState} from '../shared/types';
import type {WorkState,WorkItem} from '../shared/work-types';
import type {SitesState,SiteItem} from '../shared/sites-types';
import type {SpacesState,SpacePage} from '../shared/spaces-types';
import type {CustomizeState} from '../shared/customize-types';
import {demoArtifact,validateArtifact} from '../shared/work-artifacts.mjs';

const stamp='2026-10-26T14:00:00.000Z';
const copy=<T,>(value:T):T=>structuredClone(value);
const id=()=>crypto.randomUUID();
const desktop=async():Promise<never>=>{throw new Error('This action needs the MuseBench desktop app. Browser preview uses sample data only.');};
const runtime:RuntimeState={simulation:true,status:'ready',reason:'Browser preview · No model or shell connection',binary:null,sdkVersion:'Preview',modelId:'Muse · sample',liveVerified:false};
function task(title:string,taskId:string=id(),projectId='preview-project'):Task {
 return {id:taskId,projectId,title,mode:'muse',createdAt:stamp,updatedAt:stamp,acceptedRevision:null,request:title,plan:'',criteria:[],planApproved:false,baselineRevision:'sample-before',revision:'sample-after',changes:[],messages:[{id:id(),role:'user',text:title,at:stamp}],shellResults:[],check:null,previewRevision:null,runtimeComplete:true,runOptions:{reasoning:'high',approval:'ask'},runs:[]};
}
function channel<T>(get:()=>T){
 const listeners=new Set<(value:T)=>void>();
 return {read:async()=>copy(get()),on:(listener:(value:T)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},emit:()=>{const next=copy(get());for(const listener of listeners)listener(copy(next));return next;}};
}

export function createPreviewBridge():MuseBenchBridge {
 const project={id:'preview-project',name:'MuseBench sample',root:'Sample workspace / MuseBench',demo:false,scripts:{test:'Example tests',build:'Example build'},instructions:'Keep the interface clear and accessible.'};
 const initial=task('Build a clearer project overview','preview-overview');
 initial.messages.push({id:id(),role:'assistant',at:stamp,text:'The project overview now keeps your recent threads together, with a clear place to start a new chat.\n\nYou can open the changed file below, explore the composer controls, or switch to Muse AI. This is fictional sample content for visual feedback.'});
 initial.changes=[{path:'src/ProjectOverview.tsx',status:'modified',additions:3,deletions:1,before:'<h1>Project</h1>\n',after:'<h1>Your project</h1>\n<p>Pick up where you left off.</p>\n<button>New chat</button>\n'}];
 initial.runs=[{id:'sample-run',promptId:initial.messages[0].id,prompt:initial.request,runId:'sample',status:'completed',startedAt:stamp,endedAt:stamp,activities:[{id:'sample-layout',kind:'tool',title:'Updated the project overview',tool:'edit',status:'completed',detail:'src/ProjectOverview.tsx',output:'Sample change for preview only.'}]}];
 initial.runs[0].activities.push({id:'sample-workflow',kind:'tool',title:'Workflow: Preview review',tool:'workflow',status:'completed',detail:'Simulated workflow progress for preview only',output:'',workflow:{parentRunId:'sample',parallelLimit:2}});
 const other=task('Polish the chat composer','preview-composer');
 other.messages.push({id:id(),role:'assistant',at:stamp,text:'A compact composer keeps attachments, reasoning, and approval controls close to your message. Open the menus to review their spacing.'});
 const tasks=new Map([initial,other].map(t=>[t.id,t]));
 const state:AppState={workflows:copy(DEFAULT_WORKFLOWS),backgroundChats:true,projectCreationRoot:'Documents/MuseBench',projects:[project],tasks:[initial,other],activeProject:project,task:initial,checkpoints:[],preview:{status:'stopped',url:null,log:'',script:null},runtime:copy(runtime),busy:false,error:null,drafts:{}};
 const code=channel(()=>state);
 function sync(){state.tasks=[...tasks.values()];return code.emit();}
 const sampleWorktrees:import('../shared/types').ManagedWorktree[]=[];
 const imageData=new Map<string,string>();
 function reply(current:Task,text:string,images:import('../shared/types').CodeImage[]=[]){current.nativeSession??={id:id(),root:state.activeProject?.root??project.root,seeded:true,status:'ready'};current.messages.push({id:id(),role:'user',text,images,at:new Date().toISOString()},{id:id(),role:'assistant',text:'Preview reply — your message is shown here so you can review the conversation layout. No request was sent to Muse and no project files were changed.',at:new Date().toISOString()});current.updatedAt=new Date().toISOString();}
 async function dispatch(action:Action):Promise<AppState>{
  const current=state.task;
  switch(action.type){
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
   case 'queueMessage':if(current){if((current.promptQueue??[]).length>=5)throw Error('The queue holds up to five prompts.');if(!action.text.trim())throw Error('Enter a prompt.');(current.promptQueue??=[]).push({id:id(),text:action.text.trim(),files:copy(action.files??[]),images:copy(action.images??[]),mode:action.mode??'chat',runOptions:copy(action.runOptions??current.runOptions!),at:stamp});current.queuePaused=true;}break;
   case 'moveQueued':if(current)current.promptQueue=moveQueuedPrompt(current,action);break;
   case 'removeQueued':if(current)current.promptQueue=current.promptQueue?.filter(item=>item.id!==action.id);break;
   case 'pauseQueue':if(current)current.queuePaused=true;break;
   case 'resumeQueue':if(current){const next=current.promptQueue?.[0];if(next&&missingChecks(current,current.revision,next.requiredChecks??[]).length)throw Error('Run passing checks for this revision before this workflow phase.');current.promptQueue?.shift();if(next)reply(current,next.text,next.images);current.queuePaused=true;}break;
   case 'sendMessage':if(current)reply(current,action.text,action.images);break;
   case 'renameTask':if(current)current.title=action.title;break;
   case 'setRunOptions':if(current)current.runOptions=copy(action.runOptions);break;
   case 'setGoal':if(current)current.goal={objective:action.objective,status:action.status};break;
   case 'setMemories':state.memories=action.text;break;
   case 'setProjectInstructions':{const target=state.projects.find(p=>p.id===action.projectId);if(target)target.instructions=action.text;break;}
   case 'moveSidebarItem':{const planned=planSidebarMove(state.projects,[...tasks.values()],state.sidebarOrder,action);state.sidebarOrder=planned.orders;if(action.kind==='chat'){const target=tasks.get(action.id)!;if(action.section==='project'){target.projectId=action.projectId!;if(state.task?.id===target.id)state.activeProject=state.projects.find(p=>p.id===target.projectId)!;}if(action.section==='pinned')target.pinned=true;if(action.section==='recents')target.pinned=false;}break;}
   case 'setTaskFlags':{const target=tasks.get(action.id);if(target){if(action.pinned!==undefined)target.pinned=action.pinned;if(action.archived!==undefined){if(action.archived&&!target.archived)target.archivedAt=new Date().toISOString();if(!action.archived)target.archivedAt=null;target.archived=action.archived;}if(target.archived)target.pinned=false;}break;}
   case 'deleteTask':{const target=tasks.get(action.id);if(!target?.archived)throw Error('Archive this chat first.');tasks.delete(action.id);if(state.task?.id===action.id)state.task=null;for(const key of Object.keys(state.drafts??{})){if(key.endsWith(action.id))delete state.drafts![key];}break;}
   case 'forkTask':if(current){const index=current.messages.findIndex(m=>m.id===action.messageId&&m.role!=='system');if(index<0)throw Error('Select a sample message first.');const selected=current.messages[index],fork=copy(current);fork.id=id();fork.title=`Branch: ${current.title}`;fork.pinned=false;fork.archived=false;fork.archivedAt=null;fork.messages=fork.messages.slice(0,index+(selected.role==='assistant'?1:0)).filter(m=>m.role!=='system').map(m=>({...m,id:id()}));fork.runs=[];fork.changes=[];if(selected.role==='user')(state.drafts??={})[`${fork.projectId}:${fork.id}`]={text:selected.text,files:selected.files??[],images:selected.images??[],mode:'chat',updatedAt:new Date().toISOString()};tasks.set(fork.id,fork);state.task=fork;}break;
   case 'clearError':state.error=null;break;
   case 'refresh':break;
   default:return desktop();
  }
  return sync();
 }
 const personal:PersonalState={profile:{displayName:'Alex Morgan',avatarSeed:'musebench-sample-account',sample:true},destination:'bot',loading:false,origin:'',error:null,canGoBack:false,canGoForward:false,visible:false,available:{bot:true,chat:true,ideas:true,goals:true},compact:true,notice:null,authenticating:false,authWindowOpen:false,library:{selectedId:'sample-chat',chats:{status:'ready',items:[{id:'sample-chat',kind:'chat',title:'Plan a thoughtful week'},{id:'sample-notes',kind:'chat',title:'Turn notes into next steps'}]},ideas:{status:'ready',items:[{id:'sample-idea',kind:'idea',title:'A calmer morning routine'}]},goals:{status:'ready',items:[{id:'sample-goal',kind:'goal',title:'Build a habit of learning'}]}}};
 const person=channel(()=>personal);
 function applySnapshot(){const {key,snapshot}=selectedSnapshot();personal.schedules=key==='scheduled'?copy(snapshot?.personal?.schedules??{status:'unavailable',items:[]}):null;if(snapshot?.personal){personal.agentProfile=copy(snapshot.personal.agentProfile);personal.library=copy(snapshot.personal.library);}person.emit();}
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
 const sites:SitesState={items:[site],activeId:null,site:null,files:[],versions:[],previewUrl:null,hosting:{connected:false,accountName:null,teams:[],teamId:null,oauthAvailable:false,authPending:false},busy:false,operation:null,error:null,notice:null,generation:null};
 const siteChannel=channel(()=>sites);
 function selectSite(key:string){sites.site=sites.items.find(i=>i.id===key)??site;sites.activeId=sites.site.id;sites.files=Object.entries(siteFiles).map(([path,text])=>({path,bytes:new TextEncoder().encode(text).length,sha1:'sample',mime:'text/html'}));sites.previewUrl=`data:text/html;charset=utf-8,${encodeURIComponent(siteFiles['index.html'])}`;}
 const hookProjects=new Map<string,NonNullable<CustomizeState['hooks']>>();
 const customize:CustomizeState={available:true,errors:[],pluginsReviewed:true,pluginRevision:'sample',skills:[{id:'sample-skill',title:'Clear project notes',description:'Turn a rough brief into a useful implementation outline.',scope:'user',activation:'user-only'}],plugins:[],servers:[]};
 const dictation={id:null,status:'idle' as const,available:false,language:null,text:'',error:'Microphone input is available in the desktop app.'};
 return {
  windowControlsOverlay:true,
  inspectWorktrees:async input=>({root:state.projects.find(p=>p.id===input.projectId)?.root??project.root,branch:'main',head:'sample-base',dirty:true,items:copy(sampleWorktrees)}),
  importCodeImage:async input=>{const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(input.dataUrl);if(!match||input.dataUrl.length>11200000)throw Error('Choose an image up to 8 MB.');const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');imageData.set(input.projectId+id,input.dataUrl);return{id,name:input.name,mime:match[1],bytes:bytes.length};},
  readCodeImage:async input=>{const data=imageData.get(input.projectId+input.image.id);if(!data)throw Error('Screenshot unavailable');return data;},
  getState:code.read,onState:code.on,dispatch,openProjectFile:desktop,chooseProject:desktop,chooseBinary:desktop,openExternal:async(url:string)=>{const u=new URL(url);if(u.origin!=='https://www.google.com'||u.pathname!=='/search'||!u.searchParams.get('q'))return desktop();window.open(u.href,'_blank','noopener,noreferrer');},
  configureNotifications:async()=>({supported:false}),dictation:async command=>{if(['status','refresh','cancel','stop'].includes(command))return copy(dictation);return desktop();},onDictation:()=>()=>{},
  saveCodeDraft:async input=>{state.drafts![`${input.projectId}:${input.taskId??'new'}`]={text:input.text,files:copy(input.files),images:copy(input.images??[]),mode:input.mode};},
  readChatHistory:async input=>{const t=tasks.get(input.taskId);if(!t)throw Error('Chat not found.');let messages=t.messages;const end=input.before?messages.findIndex(m=>m.id===input.before):messages.length;if(end<0)throw Error('Invalid history cursor.');messages=input.messageId?messages.filter(m=>m.id===input.messageId):messages.slice(Math.max(0,end-(input.limit??20)),end);const offset=input.offset??0;return copy({messages:messages.map(m=>({...m,text:m.text.slice(offset,offset+12000),textLength:m.text.length,offset})),total:t.messages.length,before:!input.messageId&&end>messages.length?messages[0]?.id??null:null,coverage:'preview-sample'});},
  searchChats:async input=>copy([...tasks.values()].filter(t=>input.includeArchived||!t.archived).flatMap(t=>{const needle=input.query.toLowerCase(),m=t.messages.find(m=>m.role!=='system'&&m.text.toLowerCase().includes(needle));if(needle&&!m&&!t.title.toLowerCase().includes(needle)&&!project.name.toLowerCase().includes(needle))return[];return[{...t,projectName:project.name,snippet:m?.text??t.title,messageId:m?.id,at:m?.at}];})),
  inspectCodeContext:async input=>({characters:input.text.length,estimatedTokens:Math.ceil(input.text.length/4),includedMessages:0,omittedMessages:0,truncatedMessages:0,fileCount:0,replayedFiles:0,limit:24000,prompt:input.text,attachments:[],files:[]}),
  commandInfo:async type=>{if(type==='skills')return {status:'ready',skills:[{id:'sample-skill',name:'clear-project-notes',title:'Clear project notes',description:'Sample skill',scope:'Personal',available:true},...['plan','grill','browser-app-delivery','git','create-skill','workflow-authoring'].map(name=>({id:`bundled:${name}`,name,title:name,description:'Bundled Muse skill. This preview shows catalog data without running Muse.',scope:'Bundled',activation:'on',source:`bundled://muse-core/skills/${name}/SKILL.md`,available:true})),{id:'project:sample',name:'project-sample',title:'Project skill example',description:'A project skill requiring workspace trust.',scope:'Project',available:false,unavailableReason:'Project skill trust is not supported by this connection'}]};if(type==='usage')return {status:'ready',message:'Browser preview does not use model credits.',rows:[{label:'Mode',value:'Sample data'}]};return desktop();},
  personalState:person.read,onPersonalState:person.on,onPersonalShortcut:()=>()=>{},personal:async command=>{
   personal.error=null;
   switch(command.type){
    case 'navigate':personal.notice=null;personal.destination=command.destination;personal.library.selectedId=null;selectSnapshot(command.destination);break;
    case 'metaAction':personal.destination='chat';personal.notice=null;selectSnapshot(command.action==='newChat'?'chat':command.action as SnapshotKey);break;
    case 'scheduleAction':personal.notice='This is a read-only desktop snapshot. Use the desktop app to create, edit, or delete real scheduled tasks.';break;
    case 'selectItem':{personal.notice='This snapshot shows the captured page. Open individual account items in the desktop app.';const found=[...personal.library.chats.items,...personal.library.ideas.items,...personal.library.goals.items].find(i=>i.id===command.id);personal.library.selectedId=command.id;personal.destination=found?.kind==='idea'?'ideas':found?.kind==='goal'?'goals':'bot';break;}
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
   const hookRoot=state.activeProject?.root;if(hookRoot&&!hookProjects.has(hookRoot))hookProjects.set(hookRoot,{root:hookRoot,revision:'preview-hooks',items:[]});customize.hooks=hookRoot?hookProjects.get(hookRoot):null;
   if(command.type==='saveHooks'){if(command.root!==state.activeProject?.root||command.revision!==customize.hooks?.revision||!command.reviewed)throw Error('Project hooks changed. Refresh and review again.');customize.hooks={root:command.root,revision:id(),items:validateHooks(command.hooks)};hookProjects.set(command.root,customize.hooks);return{state:copy(customize),message:'Sample project hooks saved. No commands run in preview.'};}
   if(['reviewProject','approveProject','revokeProject'].includes(command.type))return {state:copy(customize),projectReview:{root:state.activeProject?.root??project.root,fingerprint:'Preview sample',reviewed:command.type==='approveProject',files:[{path:'AGENTS.md',text:'Preview sample: keep shared desktop and browser controls in sync.'}]}};
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
   else if(command.type==='skillActivation'){const skill=customize.skills.find(s=>s.id===command.id);if(skill)skill.activation=command.activation;}
   else if(command.type!=='refresh')return desktop();
   return {state:copy(customize)};
  },
 };
}
