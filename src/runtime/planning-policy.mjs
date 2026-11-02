import {checkConfiguration} from './configuration-review.mjs';

const switches=new Set(['--json','--api-key-stdin']);
const disabled=new Set(['--disable-write','--disable-shell','--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--no-session-log']);
const values=new Set(['--provider','--model','--workspace','--reasoning-effort','--max-model-steps','--max-tool-output-bytes','--prompt-file','--image','--output-schema','--base-url']);
const replaced=new Set(['--permission-profile','--approval-mode','--approval-judge','--contributor-mode','--sandbox-network','--preset']);
const configs=new Set(['hooks','managed_hooks_path','run.toolset','tools.web_fetch.enabled']);
const policyArgs=['--permission-profile',':read-only','--contributor-mode','off',...disabled,'-c','hooks={}','-c','managed_hooks_path=null','-c','run.toolset=["read_file","search"]'];

function unavailable(message='This native configuration cannot enforce read-only planning. No turn was sent.'){
 return Object.assign(Error(message),{code:'PLAN_BOUNDARY_UNAVAILABLE',inputAdmission:'not-sent'});
}

/** A normal MSP session's tools/host permissions cannot be narrowed by turn/start.
 * A caller may route the request to a separately checked exec owner instead. */
export function assertPlanningTransport({mode,transport}={}){
 if(mode==='plan'&&transport!=='exec')throw unavailable('Read-only planning needs a separate native exec run. This MSP session has not been changed and no planning turn was sent.');
}

/** Run immediately before planning dispatch, alongside the native managed-plane
 * absence check. Existing review grants must never authorize extension processes
 * under a read-only label: hooks/MCP/plugins execute outside the shell sandbox.
 * This reads configuration only; it does not modify native or app profiles. */
export async function verifyPlanningConfiguration({environment=process.env,platform=process.platform,workspaceRoot}={}){
 return await checkConfiguration({environment,platform,workspaceRoot});
}

/** Transform the FINAL exec argv before spawn. The closed input grammar prevents
 * future/unknown flags or overrides from silently widening this boundary.
 * Read/search are real native tools, not instructions. Shell/write tools and all
 * delegation/workflow/control tools are absent from the exact run.toolset.
 *
 * Prerequisites: pinned native version, fresh verifyPlanningConfiguration and
 * native managed-plane absence verification. This pure argv policy alone cannot
 * establish that an external configuration directory contains no extensions.
 * Retained sessions are rejected to avoid inheriting an earlier write-capable
 * session. Local transcript context can be supplied as ordinary prompt data. */
export function applyPlanningArgs(args){
 if(!Array.isArray(args)||args[0]!=='exec'||args.some(arg=>typeof arg!=='string'||arg.includes('\0')))throw unavailable();
 const prefix=['exec'];let suffix=[];
 for(let i=1;i<args.length;i++){
  const arg=args[i];
  if(arg==='--'){suffix=args.slice(i);break;}
  if(disabled.has(arg)||arg==='--disable-sandbox'||arg==='--disable-approval')continue;
  if(switches.has(arg)){prefix.push(arg);continue;}
  if(values.has(arg)||replaced.has(arg)||arg==='-c'||arg==='--config'){
   const value=args[++i];if(typeof value!=='string'||!value||value.startsWith('-'))throw unavailable();
   if(arg==='--provider'&&!['meta','echo'].includes(value))throw unavailable();
   if(values.has(arg)){prefix.push(arg,value);continue;}
   if(replaced.has(arg)){
    if(arg==='--preset'&&!['native-basic','empty'].includes(value))throw unavailable();
    continue;
   }
   const split=value.indexOf('='),key=value.slice(0,split);
   if(split<1||!configs.has(key))throw unavailable();
   // Remove all competing overrides; exactly one authoritative value is emitted.
   continue;
  }
  throw unavailable();
 }
 return [...prefix,...policyArgs,...suffix];
}

/** Predictions receive conversation text only. No native tools or retained
 * session can be inherited from the ordinary workspace runtime. */
export function applyPredictionArgs(args){
 const bounded=applyPlanningArgs(args).map(value=>value==='run.toolset=["read_file","search"]'?'run.toolset=[]':value);
 const index=bounded.indexOf('--max-model-steps');if(index>=0)bounded[index+1]='1';
 return bounded;
}
