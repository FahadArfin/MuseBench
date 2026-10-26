import {validateWorkflow} from '../src/shared/workflows.mjs';
import {imageReferences} from '../src/shared/code-images.mjs';
import {validateSidebarMove} from '../src/shared/sidebar-order.mjs';
import {projectDetails} from '../src/shared/create-project.mjs';
import {fileReferences} from '../src/shared/chat-context.mjs';
import {validateRunOptions} from '../src/shared/run-options.mjs';
const actions = new Set(['saveWorkflow','deleteWorkflow','queueWorkflow','handoffContext','recoverSession','moveSidebarItem','createWorktree','openWorktree','createProject','setProjectInstructions','saveDraft','setTaskFlags','deleteTask','forkTask','queueMessage','moveQueued','removeQueued','pauseQueue','resumeQueue','renameTask','setGoal','setMemories','openProject','selectProject','selectTask','createDemo','createCommandCopy','newTask','setRunOptions','updatePlan','approvePlan','applyDemo','refresh','runCheck','cancelCheck','startPreview','stopPreview','inspectPreview','accept','sendMessage','connectMuse','disconnectMuse','runtimeDecision','clearError']);
export function allowedExternal(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (['dev.meta.ai','github.com','meta-models.github.io'].includes(u.hostname) || (u.hostname === 'www.google.com' && u.pathname === '/search' && [...u.searchParams.keys()].every(key=>key==='q') && u.searchParams.getAll('q').length===1 && Boolean(u.searchParams.get('q')?.trim()) && !u.hash)); } catch { return false; }
}
export function trustedSender(event, contents, uiURL) { return event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame.url === uiURL; }
export function validateAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || !actions.has(action.type) || JSON.stringify(action).length > 100000) throw Error('Invalid workspace action.');
  const string = (name,max=20000) => { if (typeof action[name] !== 'string' || !action[name].trim() || action[name].length > max) throw Error(`Invalid ${name}.`); };
  if(action.type==='saveWorkflow')validateWorkflow(action.workflow);
  if(action.type==='deleteWorkflow')string('id',100);
  if(action.type==='queueWorkflow'){for(const key of ['id','taskId','workflowId'])string(key,200);string('objective',3000);}
  if(action.type==='handoffContext'){for(const key of ['id','sourceTaskId','targetTaskId'])string(key,200);string('text',8000);fileReferences(action.files);if(Object.keys(action).some(key=>!['type','id','sourceTaskId','targetTaskId','text','files'].includes(key)))throw Error('Invalid handoff fields.');}
  if(action.type==='recoverSession'&&!['continue','fresh'].includes(action.choice))throw Error('Invalid session recovery.');
  if(action.type==='moveQueued'){string('taskId',200);string('id',200);if(action.beforeId!==null)string('beforeId',200);}
  if(action.type==='moveSidebarItem')validateSidebarMove(action);
  if(action.type==='createProject')projectDetails(action);
  const fields = {openProject:'path',selectProject:'id',selectTask:'id',newTask:'request',runCheck:'script',startPreview:'script',inspectPreview:'revision',accept:'revision',sendMessage:'text',runtimeDecision:'decision'};
  if (fields[action.type]) string(fields[action.type]);
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
  if(['sendMessage','queueMessage','saveDraft'].includes(action.type)){fileReferences(action.files);imageReferences(action.images);if(action.fromQueue!==undefined||action.type==='sendMessage'&&action.runOptions!==undefined)throw Error('Invalid request options.');}
  if(['queueMessage','saveDraft'].includes(action.type)){if(typeof action.text!=='string'||action.text.length>16000||action.type==='queueMessage'&&!action.text.trim()||action.mode!==undefined&&!['chat','plan'].includes(action.mode))throw Error('Invalid prompt or draft.');if(action.runOptions!==undefined)validateRunOptions(action.runOptions);}
  if(['saveDraft','setProjectInstructions'].includes(action.type))string('projectId',200);
  if(action.type==='saveDraft'&&action.taskId!==null)string('taskId',200);
  if(action.type==='setProjectInstructions'&&(typeof action.text!=='string'||action.text.length>4000))throw Error('Invalid project instructions.');
  if(['setTaskFlags','deleteTask','removeQueued'].includes(action.type))string('id',200);
  if(action.type==='setTaskFlags'&&(action.pinned!==undefined&&typeof action.pinned!=='boolean'||action.archived!==undefined&&typeof action.archived!=='boolean'))throw Error('Invalid chat flags.');
  if(action.type==='forkTask')string('messageId',200);
  return structuredClone(action);
}
