import {validateInputAction} from '../src/shared/user-input.mjs';
import {validateCheckScripts} from '../src/shared/validation.mjs';
import {validateWorkflow} from '../src/shared/workflows.mjs';
import {imageReferences} from '../src/shared/code-images.mjs';
import {validateSidebarMove} from '../src/shared/sidebar-order.mjs';
import {projectDetails} from '../src/shared/create-project.mjs';
import {fileReferences} from '../src/shared/chat-context.mjs';
import {validateRunOptions} from '../src/shared/run-options.mjs';
const actions = new Set(['answerInput','setExecutionAccess','childControl','compactSession','steerMessage','createReviewer','integrateReview','cancelReviewers','continueGoal','pauseGoalContinuation','proposeLesson','decideLesson','restoreCheckpoint','saveValidationProfile','runValidation','refreshModels','archiveWorktree','restoreWorktree','recoverWorktree','setupWorktree','saveWorkflow','deleteWorkflow','queueWorkflow','handoffContext','recoverSession','moveSidebarItem','createWorktree','openWorktree','createProject','setProjectInstructions','saveDraft','setTaskFlags','deleteTask','forkTask','queueMessage','moveQueued','removeQueued','pauseQueue','resumeQueue','renameTask','setGoal','setMemories','openProject','selectProject','selectTask','createDemo','createCommandCopy','newTask','setRunOptions','updatePlan','approvePlan','applyDemo','refresh','runCheck','cancelCheck','startPreview','stopPreview','inspectPreview','accept','sendMessage','connectMuse','disconnectMuse','runtimeDecision','clearError']);
export function allowedExternal(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (['dev.meta.ai','github.com','meta-models.github.io'].includes(u.hostname) || (u.hostname === 'www.google.com' && u.pathname === '/search' && [...u.searchParams.keys()].every(key=>key==='q') && u.searchParams.getAll('q').length===1 && Boolean(u.searchParams.get('q')?.trim()) && !u.hash)); } catch { return false; }
}
export function trustedSender(event, contents, uiURL) { return event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame.url === uiURL; }
export function validateAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || !actions.has(action.type) || JSON.stringify(action).length > 100000) throw Error('Invalid workspace action.');
  const string = (name,max=20000) => { if (typeof action[name] !== 'string' || !action[name].trim() || action[name].length > max) throw Error(`Invalid ${name}.`); };
  if(['archiveWorktree','restoreWorktree','recoverWorktree','setupWorktree'].includes(action.type)){string('projectId',200);if(action.type==='setupWorktree')string('script',100);else string('id',100);if(action.type==='recoverWorktree')string('branch',100);}
  if(action.type==='saveValidationProfile'){string('projectId',200);validateCheckScripts(action.scripts);}
  if(action.type==='saveWorkflow')validateWorkflow(action.workflow);
  if(action.type==='deleteWorkflow')string('id',100);
  if(action.type==='queueWorkflow'){for(const key of ['id','taskId','workflowId'])string(key,200);string('objective',3000);}
  if(action.type==='handoffContext'){for(const key of ['id','sourceTaskId','targetTaskId'])string(key,200);string('text',8000);fileReferences(action.files);if(Object.keys(action).some(key=>!['type','id','sourceTaskId','targetTaskId','text','files'].includes(key)))throw Error('Invalid handoff fields.');}
  if(action.type==='recoverSession'&&!['continue','fresh'].includes(action.choice))throw Error('Invalid session recovery.');
  if(action.type==='moveQueued'){string('taskId',200);string('id',200);if(action.beforeId!==null)string('beforeId',200);}
  if(action.type==='moveSidebarItem')validateSidebarMove(action);
  if(action.type==='createProject')projectDetails(action);
  if(action.type==='restoreCheckpoint'){for(const key of ['taskId','id','revision'])if(typeof action[key]!=='string'||!action[key]||action[key].length>200)throw Error('Invalid checkpoint binding.');if(!Array.isArray(action.paths)||!action.paths.length||action.paths.length>100||action.paths.some(p=>typeof p!=='string'||p.length>1000))throw Error('Invalid restore selection.');}
  if(['proposeLesson','decideLesson'].includes(action.type)){if(typeof action.projectId!=='string')throw Error('Choose a project.');if(action.type==='decideLesson'&&(typeof action.id!=='string'||!['accept','reject','revoke'].includes(action.decision)))throw Error('Invalid lesson decision.');if(action.type==='proposeLesson'&&['taskId','messageId','title','text','applicability'].some(k=>typeof action[k]!=='string'||action[k].length>1600))throw Error('Invalid lesson proposal.');}
  if(action.type==='continueGoal'&&(!Number.isInteger(action.maxRounds)||action.maxRounds<1||action.maxRounds>8||!Number.isInteger(action.minutes)||action.minutes<1||action.minutes>60))throw Error('Invalid goal budget.');
  if(action.type==='createReviewer'&&(['parentTaskId','projectId','role','question'].some(k=>typeof action[k]!=='string'||!action[k]||action[k].length>2000)))throw Error('Invalid review contract.');if(action.type==='integrateReview'&&typeof action.taskId!=='string')throw Error('Invalid review chat.');
  const fields = {openProject:'path',selectProject:'id',selectTask:'id',newTask:'request',runCheck:'script',startPreview:'script',inspectPreview:'revision',accept:'revision',sendMessage:'text',runtimeDecision:'decision'};
  if (fields[action.type]) string(fields[action.type]);
  if(action.type==='answerInput'){string('taskId',200);validateInputAction(action);}
  if(action.type==='setExecutionAccess'){string('taskId',200);if(typeof action.fullAccess!=='boolean')throw Error('Full access must be explicitly selected.');}
  if(action.type==='childControl'){for(const key of ['taskId','sessionId','itemId'])string(key,200);if(!Number.isInteger(action.revision)||action.revision<1||!['sendMessage','followupTask','interrupt','stop','resume','reopen','close','readResult','retry','skip'].includes(action.action))throw Error('Invalid child control.');if(['sendMessage','followupTask'].includes(action.action))string('body',8000);if(['retry','skip'].includes(action.action)){string('childId',200);if(!Number.isInteger(action.attempt)||action.attempt<1)throw Error('Invalid child attempt.');}}
  if(action.type==='compactSession'){string('taskId',200);string('sessionId',200);string('turnId',200);}
  if(action.type==='steerMessage'){string('taskId',200);string('expectedTurnId',200);string('text',16000);if(action.files?.length||action.images?.length)throw Error('Steering supports text only.');}
  if(action.type==='connectMuse'&&action.transport!==undefined&&!['exec','msp'].includes(action.transport))throw Error('Invalid transport.');
  if(action.type==='connectMuse'&&action.fullAccess!==undefined&&typeof action.fullAccess!=='boolean')throw Error('Full access must be a boolean.');
  if(action.type==='connectMuse'&&action.workspaceTools!==undefined&&typeof action.workspaceTools!=='boolean')throw Error('Workspace tools must be a boolean.');
  if (action.type === 'connectMuse' && action.binary !== undefined) string('binary',4096);
  if(['createWorktree','openWorktree'].includes(action.type)){string('projectId',200);if(action.type==='createWorktree'){string('branch',100);string('base',200);}else string('id',100);}
  if (action.type === 'newTask' && !['demo','manual','muse'].includes(action.mode)) throw Error('Invalid task mode.');
  if (action.type === 'sendMessage' && action.mode !== undefined && !['chat','plan'].includes(action.mode)) throw Error('Invalid message mode.');
  if (action.type === 'updatePlan') { string('plan'); if (!Array.isArray(action.criteria) || !action.criteria.length || action.criteria.length > 30 || action.criteria.some(c=>typeof c !== 'string' || !c.trim() || c.length>2000)) throw Error('Add between 1 and 30 acceptance criteria.'); }
  if (action.type === 'setRunOptions') { if (!action.runOptions) throw Error('Run options are required.'); validateRunOptions(action.runOptions); }
  if (action.type === 'newTask' && action.runOptions !== undefined) validateRunOptions(action.runOptions);
  if (action.type==='renameTask') string('title',100);
  if (action.type==='setMemories' && (typeof action.text!=='string'||action.text.length>1500)) throw Error('Invalid memory instructions.');
  if (action.type==='setGoal' && (typeof action.objective!=='string'||action.objective.length>1000||!['active','paused'].includes(action.status))) throw Error('Invalid chat goal.');
  if(['sendMessage','queueMessage','saveDraft'].includes(action.type)){fileReferences(action.files);imageReferences(action.images);if(action.fromGoal!==undefined||action.fromQueue!==undefined||action.type==='sendMessage'&&action.runOptions!==undefined)throw Error('Invalid request options.');}
  if(['queueMessage','saveDraft'].includes(action.type)){if(typeof action.text!=='string'||action.text.length>16000||action.type==='queueMessage'&&!action.text.trim()||action.mode!==undefined&&!['chat','plan'].includes(action.mode))throw Error('Invalid prompt or draft.');if(action.runOptions!==undefined)validateRunOptions(action.runOptions);}
  if(['saveDraft','setProjectInstructions'].includes(action.type))string('projectId',200);
  if(action.type==='saveDraft'&&action.taskId!==null)string('taskId',200);
  if(action.type==='setProjectInstructions'&&(typeof action.text!=='string'||action.text.length>4000))throw Error('Invalid project instructions.');
  if(['setTaskFlags','deleteTask','removeQueued'].includes(action.type))string('id',200);
  if(action.type==='setTaskFlags'&&(action.pinned!==undefined&&typeof action.pinned!=='boolean'||action.archived!==undefined&&typeof action.archived!=='boolean'))throw Error('Invalid chat flags.');
  if(action.type==='forkTask')string('messageId',200);
  return structuredClone(action);
}
