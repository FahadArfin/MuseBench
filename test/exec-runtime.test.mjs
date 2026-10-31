import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp, writeFile, mkdir, rm, readFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExecRuntime} from '../src/runtime/exec.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';

test('exec disconnect discards the live catalog before a billing source can change',async t=>{
 const h=await harness(t,{loadModels:async()=>({source:'providerCatalog',models:[]})});await h.connect();await h.runtime.refreshModels();assert.ok(h.runtime.snapshot().modelCatalog);
 await h.runtime.disconnect();assert.equal(h.runtime.snapshot().modelCatalog,undefined);
});

const ready='backend=windows_elevated\nstatus=ready\nrunner_trusted=true\nrunner_version_matches=true\nsandbox_users_ready=true\ncapabilities_ready=true\nrestricted_network_required=true\nwfp_ready=true\n';
const unmanaged='Enterprise configuration status\nGeneration: sha256:123\nSources:\n  plane=defaults source_class=system_file state=absent\n  plane=policy source_class=system_file state=absent\n  plane=defaults source_class=windows_machine_policy state=absent\n  plane=policy source_class=windows_machine_policy state=absent\n';
function records({terminal='completed',text='Done',reason=null,model=true,shellResult=null}={}) {
 const id='connection-session',command='command-one',run='run-one';let sequence=0;
 const envelope=(type,kind,rest={})=>({schema_version:1,payload_schema_version:1,id:'record-'+(++sequence),stream:{kind:'session',id},sequence,recorded_at:1000+sequence,record_type:'event',durability:'durable',causation_id:command,payload_type:type,payload:{kind,command_id:command,...rest}});
 const correlation={run_stream:{kind:'run',id:run}};
 return [envelope('runtime.command.accepted','command_accepted',{command_kind:'turn.submit'}),envelope('session.run.linked','session_run_linked',correlation),...(model?[envelope('run.model.configured','run_model_configured',{...correlation,provider_id:'meta',model_id:'muse-spark-test',source:'startup'})]:[]),envelope('run.lifecycle.started','run_started',correlation),...(shellResult?[envelope('tool.result','tool_result',{...correlation,call_id:'shell-call-one',correlation_facts:{tool_name:'powershell',outcome:'success'},text:JSON.stringify(shellResult)})]:[]),envelope('run.output.delta','run_output_delta',{...correlation,text:'partial'}),envelope('run.terminal.'+terminal,'run_terminal',{...correlation,terminal,text,reason})];
}
const jsonl=values=>values.map(value=>JSON.stringify(value)).join('\n')+'\n';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('exec compact status follows running and unconfirmed cleanup without transcript clones',async t=>{
 const h=await harness(t,{stopFails:true,timeoutMs:15});assert.equal(typeof h.runtime.statusSnapshot,'function');
 const check=()=>{const s=h.runtime.snapshot();let copies=0;const clone=globalThis.structuredClone;const mocked=t.mock.method(globalThis,'structuredClone',value=>{copies++;return clone(value);});let actual;try{actual=h.runtime.statusSnapshot();}finally{mocked.mock.restore();}assert.equal(copies,0);assert.deepEqual(actual,{status:s.status??null,cleanup:s.cleanup??null,pending:!!s.pending,operationBusy:!!s.operationBusy,childrenBusy:!!s.childrenBusy});return actual;};
 assert.equal(check().status,'unavailable');await h.connect();assert.equal(check().status,'idle');await h.runtime.send({text:'Synthetic status fixture'});assert.equal(check().status,'running');
 await h.runtime.disconnect();assert.equal(check().cleanup,'unconfirmed');assert.equal(check().status,'unavailable');
});

test('Full access is explicit, skips sandbox readiness, and preserves human approval',async t=>{
 const h=await harness(t,{ready:'status=not-ready\n'});
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.profile,fullAccess:true});
 assert.equal(h.runtime.snapshot().fullAccess,true);
 assert.equal(h.runtime.snapshot().shellEnabled,true);
 assert.equal(h.calls.some(c=>c.args[0]==='sandbox'),false);
 assert.ok(h.calls.at(-1).args.includes('--disable-sandbox'));
 await h.runtime.send({text:'Print a marker'});
 const args=h.calls.at(-1).args;
 assert.ok(args.includes('--disable-sandbox'));
 assert.equal(args.includes('--disable-web-tools'),false);
 assert.equal(args[args.indexOf('--permission-profile')+1],':ask-me');
 assert.ok(!args.includes('--yolo'));
 assert.ok(!args.includes('--disable-approval'));
 assert.match(h.runtime.snapshot().permissionDescription,/Full access/);
 assert.doesNotMatch(h.runtime.snapshot().permissionDescription,/sandboxed command mode/);
});

test('disconnect and default reconnect do not retain Full access',async t=>{
 const h=await harness(t);
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,fullAccess:true});
 await h.runtime.disconnect();
 assert.equal(h.runtime.snapshot().fullAccess,false);
 await h.connect();
 assert.equal(h.runtime.snapshot().fullAccess,false);
 assert.ok(h.calls.some(c=>c.args[0]==='sandbox'));
 assert.ok(!h.calls.at(-1).args.includes('--disable-sandbox'));
});

test('invalid Full access values cannot start a host',async t=>{
 const h=await harness(t);
 for(const fullAccess of ['true',1,null,{}])await assert.rejects(h.runtime.connect({binary:h.binary,workspaceRoot:h.root,fullAccess}),/Full access/);
 assert.equal(h.calls.length,0);
});

test('reasoning and approval selections reach each native run without disabling the sandbox',async t=>{
 for(const [approval,args] of [['ask',['--permission-profile',':ask-me']],['auto',['--permission-profile',':auto-review']],['never',['--approval-mode','never','--approval-judge','off']]]){
  const h=await harness(t);await h.connect();await h.runtime.send({text:'Explain the code',runOptions:{reasoning:'xhigh',approval}});
  const argv=h.calls.at(-1).args;
  assert.equal(argv[argv.indexOf('--reasoning-effort')+1],'xhigh');
  for(const arg of args)assert(argv.includes(arg));
  for(const arg of ['--disable-sandbox','--yolo','--trust-workspace','--disable-approval','--enable-shell-tool'])assert(!argv.includes(arg));
  assert(argv.includes('--disable-web-tools'));assert(argv.includes('hooks={}'));
 }
});

test('reviewed project hooks reach only model runs, with native sandbox and global-hook exclusion retained',async t=>{
 const hooks={UserPromptSubmit:[{hooks:[{type:'command',commandWindows:'echo reviewed',timeout:3}]}]};let root;
 const h=await harness(t,{extensionReview:{allowProject:async()=>false,nativeHooks:async value=>{root=value;return hooks;}}});await h.connect();assert.ok(h.calls.at(-1).args.includes('hooks={}'));
 await h.runtime.send({text:'Go'});assert.equal(root,h.root);assert.ok(h.runtime.snapshot().permissionArguments.includes('hooks='+JSON.stringify(hooks)));const args=h.calls.at(-1).args;assert.ok(args.includes('hooks='+JSON.stringify(hooks)));assert.ok(args.includes('managed_hooks_path=null'));assert.ok(!args.includes('--disable-sandbox'));assert.ok(!args.includes('--trust-workspace'));
});
test('unreadable project hooks block preflight without leaving a phantom running task',async t=>{
 let unreadable=false;const h=await harness(t,{extensionReview:{allowProject:async()=>false,nativeHooks:async()=>{if(unreadable)throw Error('Project hook review is unreadable');return{};}}});await h.connect();unreadable=true;await assert.rejects(h.runtime.send({text:'Go'}),/unreadable/);assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.runtime.snapshot().permissionVerified,false);assert.equal(h.calls.some(c=>c.args.includes('meta')),false);
});
test('invalid run options are rejected before any native request starts',async t=>{
 const h=await harness(t);await h.connect();const count=h.calls.length;
 for(const runOptions of [{reasoning:'invented',approval:'ask'},{reasoning:'high',approval:'unrestricted'},{reasoning:'high',approval:'ask',sandbox:false}])await assert.rejects(h.runtime.send({text:'Explain',runOptions}),/option|reasoning|approval/i);
 assert.equal(h.calls.length,count);
});

test('exec send distinguishes preflight rejection from process dispatch uncertainty',async t=>{
 const h=await harness(t,{modelThrows:true});await h.connect();const count=h.calls.length;
 await assert.rejects(h.runtime.send({text:' ',mode:'chat'}),error=>error.inputAdmission==='not-sent');
 assert.equal(h.calls.length,count);
 await assert.rejects(h.runtime.send({text:'Inspect'}),error=>error.inputAdmission==='unknown');
 assert.equal(h.calls.filter(call=>call.args.includes('meta')).length,0);
});
test('large context uses a prompt file and removes it after cancelled native cleanup',async t=>{
 const h=await harness(t);await h.connect();const text='Context text '.repeat(1400);await h.runtime.send({text});const args=h.calls.at(-1).args,file=args[args.indexOf('--prompt-file')+1];assert.ok(file);assert.match(await readFile(file,'utf8'),/Context text/);assert.ok(!args.includes(text));assert.ok(!args.includes('--disable-sandbox'));await h.runtime.disconnect();for(let i=0;i<30;i++){try{await stat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}await new Promise(r=>setTimeout(r,10));}assert.fail('Temporary prompt was not removed');
});
async function harness(t,overrides={}) {
 const root=await mkdtemp(join(tmpdir(),'musebench-exec-')),binary=join(root,'muse.exe'),profile=join(root,'profile');
 await mkdir(profile);await writeFile(binary,'injected native process');
 const calls=[],children=[];
 function spawnProcess(command,args,options) {
  if(args.includes('meta')&&overrides.modelThrows)throw Error('private-secret spawn exception');
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.pid=1000+children.length;child.exitCode=null;child.closed=false;
  child.finish=(code=0)=>{child.exitCode=code;child.closed=true;child.emit('close',code,null);};
  overrides.decorateChild?.(child,args);
  children.push(child);calls.push({command,args,options,child});
  queueMicrotask(()=>{
   child.emit('spawn');
   if(args[0]==='--version'){child.stdout.emit('data',Buffer.from(overrides.version??'Muse Code 1.4.14 (1.4.14-R7309.1)'));child.finish();}
   else if(args[0]==='sandbox'){child.stdout.emit('data',Buffer.from(typeof overrides.ready==='function'?overrides.ready():overrides.ready??ready));child.finish();}
   else if(args[0]==='config'){child.stdout.emit('data',Buffer.from(overrides.managed??unmanaged));child.finish();}
   else if(args.includes('echo')){child.stdout.emit('data',Buffer.from(jsonl(records({model:false}))));child.finish();}
  });
  return child;
 }
 const runtime=createExecRuntime({platform:'win32',environment:{PATH:'',USERPROFILE:profile,SystemRoot:'C:\\Windows',META_API_KEY:'private-secret',NODE_OPTIONS:'forbidden'},spawnProcess,stopProcess:async child=>{if(overrides.stopFails)return false;child.finish(1);return true;},timeoutMs:500,runTimeoutMs:1000,...overrides});
 t.after(async()=>{await runtime.close();await rm(root,{recursive:true,force:true});});
 const connect=()=>runtime.connect({binary,workspaceRoot:root});
 return {root,profile,binary,runtime,calls,children,connect,model:()=>calls.findLast(call=>call.args.includes('meta')).child};
}

test('explicit API credentials reach model processes and discovery, never readiness probes or snapshots',async t=>{
 let reject=false,discoveryEnv;const key='fixture-api-private';
 const h=await harness(t,{credentials:async({environment})=>({source:'api',environment:{...environment,META_API_KEY:key},verify:async()=>{if(reject)throw Error('Billing source changed');}}),loadModels:async({environment})=>{discoveryEnv=environment;return{models:[{id:'fixture-model',efforts:['high'],isDefault:true}]};}});
 await h.connect();assert.ok(h.calls.every(c=>!c.options.env.META_API_KEY));await h.runtime.refreshModels();assert.equal(discoveryEnv.META_API_KEY,key);
 reject=true;await assert.rejects(h.runtime.send({text:'Go'}),/changed/);assert.equal(h.calls.filter(c=>c.args.includes('meta')).length,0);
 assert.ok(!JSON.stringify(h.runtime.snapshot()).includes(key));
 reject=false;await h.runtime.send({text:'Go',runOptions:{model:'fixture-model',reasoning:'high',approval:'ask'}});
 assert.equal(h.calls.at(-1).options.env.META_API_KEY,key);assert.equal(h.calls.at(-1).args.includes('meta'),true);assert.ok(!JSON.stringify(h.runtime.snapshot()).includes(key));
});

test('exec project approval checks the actual model environment before spawning',async t=>{
 const first=await harness(t),environment={PATH:'',USERPROFILE:first.profile,SystemRoot:'C:\\Windows'};
 const review=createExtensionReview({profile:first.profile,dataDir:join(first.root,'reviews'),environment,platform:'win32'});
 const h=await harness(t,{environment,extensionReview:review,credentials:async({environment})=>({source:'api',environment:{...environment,PATH:'unreviewed-path',META_API_KEY:'fixture-private'},verify:async()=>{}})});
 await mkdir(join(h.root,'.git'));await writeFile(join(h.root,'.mcp.json'),JSON.stringify({mcpServers:{docs:{type:'stdio',command:'node',args:['server.mjs']}}}));
 const shown=await review.projectMcpState(h.root);await review.approveProjectMcp(h.root,shown.revision);
 await h.connect();await assert.rejects(h.runtime.send({text:'Do not start with a different environment'}),/review/i);
 assert.equal(h.calls.filter(c=>c.args.includes('meta')).length,0);assert.equal(h.runtime.snapshot().permissionVerified,false);
});

test('exec connect checks native version, sandbox readiness and inert format without calling a model',async t=>{
 const h=await harness(t);await h.connect();const state=h.runtime.snapshot();
 assert.equal(state.status,'idle');assert.equal(state.transport,'exec');assert.equal(state.liveVerified,false);assert.equal(state.permissionVerified,true);
 assert.equal(h.calls.some(call=>call.args.includes('meta')),false);assert.equal(h.calls.length,4);
 const probe=h.calls.at(-1);assert.equal(probe.options.shell,false);assert.equal(probe.options.windowsHide,true);assert.equal(probe.options.env.META_API_KEY,undefined);assert.equal(probe.options.env.NODE_OPTIONS,undefined);
 assert.ok(probe.args.includes(':ask-me'));assert.ok(probe.args.includes('hooks={}'));assert.ok(probe.args.includes('managed_hooks_path=null'));
 assert.equal(state.shellEnabled,true);assert.equal(state.shellUnavailableReason,null);assert.deepEqual(state.shellResults,[]);
 assert.equal(probe.args.includes('--disable-shell'),false);assert.ok(probe.args.includes('--disable-web-tools'));assert.ok(probe.args.includes('--no-session-log'));
 assert.equal(probe.args.some(arg=>/disable-sandbox|trust-workspace|approval-mode|network-policy/.test(arg)),false);
});

test('exec refuses an unready native sandbox and version mismatches before echo or models',async t=>{
 for(const options of [{ready:ready.replace('wfp_ready=true','wfp_ready=false')},{version:'Muse Code 9.0.0'}]){
  const h=await harness(t,options);await assert.rejects(h.connect(),/sandbox|version/i);assert.equal(h.calls.some(c=>c.args[0]==='exec'),false);assert.equal(h.runtime.snapshot().permissionVerified,false);
 }
});

test('exec send returns while running and only terminal plus process close proves completion',async t=>{
 const h=await harness(t);await h.connect();const synthetic=h.runtime.snapshot().sessionId;
 await h.runtime.send({text:'Edit app.js'});const child=h.model();assert.equal(h.runtime.snapshot().status,'running');
 const data=jsonl(records());child.stdout.emit('data',Buffer.from(data.slice(0,51)));child.stdout.emit('data',Buffer.from(data.slice(51)));
 assert.equal(h.runtime.snapshot().status,'running');assert.equal(h.runtime.snapshot().liveVerified,false);
 child.finish();await tick();const state=h.runtime.snapshot();assert.equal(state.status,'completed');assert.equal(state.liveVerified,true);assert.equal(state.sessionId,synthetic);assert.equal(state.nativeSessionId,'connection-session');assert.equal(state.runId,'run-one');assert.equal(state.messages.at(-1).text,'Done');
 await h.runtime.send({text:'Next independent run'});assert.equal(h.calls.filter(c=>c.args.includes('meta')).length,2);assert.equal(h.calls.at(-1).args.includes('--resume'),false);
});

test('billing failure is actionable and is not completion or retried',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});const child=h.model();
 child.stdout.emit('data',Buffer.from(jsonl(records({terminal:'failed',text:'',reason:'API error 402: Billing verification failed token=private-secret'}))));child.finish(1);await tick();
 const s=h.runtime.snapshot();assert.equal(s.status,'failed');assert.equal(s.liveVerified,false);assert.match(s.reason,/billing|402/i);assert.doesNotMatch(JSON.stringify(s),/private-secret/);assert.equal(h.calls.filter(c=>c.args.includes('meta')).length,1);assert.equal(s.messages.at(-1)?.text,'');
});

test('diagnostics redact quoted and environment credential fields and never expose arbitrary stderr',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});
 h.model().stderr.emit('data',Buffer.from('unexpected-private-diagnostic'));
 h.model().stdout.emit('data',Buffer.from(jsonl(records({terminal:'failed',text:'',reason:'Failure {"api_key":"json-secret"} META_API_KEY=env-secret accessToken="token secret value" Authorization: Bearer bearer-secret'}))));h.model().finish(1);await tick();
 assert.doesNotMatch(JSON.stringify(h.runtime.snapshot()),/json-secret|env-secret|token secret value|bearer-secret|unexpected-private-diagnostic/);
 const other=await harness(t);await other.connect();await other.runtime.send({text:'Edit'});other.model().stderr.emit('data',Buffer.from('unexpected-private-diagnostic'));
 other.model().stdout.emit('data',Buffer.from(jsonl(records({terminal:'failed',text:'',reason:null}))));other.model().finish(1);await tick();assert.doesNotMatch(JSON.stringify(other.runtime.snapshot()),/unexpected-private-diagnostic/);
});

test('classified authentication and billing stderr still use only canned diagnostics',async t=>{
 for(const diagnostic of ['authentication trace: invented-private-diagnostic','billing=invented-private-diagnostic']){
  const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});h.model().stderr.emit('data',Buffer.from(diagnostic));
  h.model().stdout.emit('data',Buffer.from(jsonl(records({terminal:'failed',text:'',reason:null}))));h.model().finish(1);await tick();
  assert.doesNotMatch(JSON.stringify(h.runtime.snapshot()),/invented-private-diagnostic/);
  assert.match(h.runtime.snapshot().reason,/official Muse CLI|Meta developer account/);
 }
});

test('malformed JSON stops the native owner and cannot become a late completion',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});const child=h.model();
 child.stdout.emit('data',Buffer.from('{bad}\n'));await tick();child.stdout.emit('data',Buffer.from(jsonl(records())));child.finish();await tick();
 assert.equal(h.runtime.snapshot().status,'uncertain');assert.equal(h.runtime.snapshot().liveVerified,false);await assert.rejects(h.runtime.send({text:'Retry'}),/connect|blocked|uncertain/i);
});

test('disconnect stays available while native output is pending and stale completion is ignored',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});const child=h.model();
 await h.runtime.disconnect();child.stdout.emit('data',Buffer.from(jsonl(records())));child.finish();await tick();
 assert.equal(h.runtime.snapshot().status,'unavailable');assert.equal(h.runtime.snapshot().cleanup,'confirmed');assert.equal(h.runtime.snapshot().liveVerified,false);
});

test('unconfirmed process cleanup prevents reconnect and another model call',async t=>{
 const h=await harness(t,{stopFails:true,timeoutMs:15});await h.connect();await h.runtime.send({text:'Edit'});await h.runtime.disconnect();
 assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');await assert.rejects(h.connect(),/shutdown|process/i);await assert.rejects(h.runtime.send({text:'Edit again'}));
});

test('parent close cannot override a pending failed process-tree shutdown',async t=>{
 let finishStop;const stopPending=new Promise(resolve=>{finishStop=resolve;});
 const h=await harness(t,{stopProcess:async child=>{child.finish(1);return stopPending;}});await h.connect();await h.runtime.send({text:'Edit'});
 h.model().stdout.emit('data',Buffer.from('{malformed}\n'));await tick();
 const disconnecting=h.runtime.disconnect();finishStop(false);await disconnecting;
 assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');await assert.rejects(h.connect(),/shutdown|process/i);
});

test('configured external MCP is rejected before any native process and rechecked before send',async t=>{
 const h=await harness(t);await mkdir(join(h.profile,'.config','muse'),{recursive:true});const settings=join(h.profile,'.config','muse','settings.json');
 await writeFile(settings,JSON.stringify({mcp_servers:{external:{command:'unsafe'}}}));await assert.rejects(h.connect(),/MCP|extension|plugin/i);assert.equal(h.calls.length,0);
 await writeFile(settings,'{}');await h.connect();await writeFile(settings,JSON.stringify({plugins:['external']}));await assert.rejects(h.runtime.send({text:'Edit'}),/MCP|extension|plugin/i);assert.equal(h.calls.some(c=>c.args.includes('meta')),false);
});

test('run timeout closes its process and cannot count partial text as success',async t=>{
 const h=await harness(t,{runTimeoutMs:15});await h.connect();await h.runtime.send({text:'Edit'});await new Promise(resolve=>setTimeout(resolve,40));
 const s=h.runtime.snapshot();assert.equal(s.status,'uncertain');assert.match(s.reason,/timed out/i);assert.equal(s.cleanup,'confirmed');assert.equal(s.liveVerified,false);
});

test('synchronous model spawn rejection fails promptly and leaks no native error details',async t=>{
 const h=await harness(t,{modelThrows:true});await h.connect();await assert.rejects(h.runtime.send({text:'Edit'}),/start|executable/i);
 assert.equal(h.runtime.snapshot().status,'uncertain');assert.equal(h.runtime.snapshot().permissionVerified,false);assert.doesNotMatch(JSON.stringify(h.runtime.snapshot()),/private-secret/);
});

test('managed defaults or policy cannot silently enable external execution',async t=>{
 for(const managed of [unmanaged.replace('state=absent','state=active'),unmanaged.replace('plane=policy source_class=windows_machine_policy state=absent',''),unmanaged+'  plane=unknown source_class=other state=absent\n']){
  const h=await harness(t,{managed});await assert.rejects(h.connect(),/managed|configuration/i);assert.equal(h.calls.some(c=>c.args.includes('echo')||c.args.includes('meta')),false);
 }
});

test('saved trust, installed plugins and ancestor workspace extension files stop restricted mode',async t=>{
 for(const kind of ['trust','plugins','mcp','hooks']){
  const h=await harness(t);let file;
  if(kind==='trust')file=join(h.profile,'.config','muse','trust.json');
  if(kind==='plugins')file=join(h.profile,'.local','share','muse','plugins','installed.json');
  if(kind==='mcp')file=join(h.root,'.mcp.json');
  if(kind==='hooks')file=join(h.root,'.muse','hooks.json');
  await mkdir(join(file,'..'),{recursive:true});await writeFile(file,'{}');
  await assert.rejects(h.connect(),/trust|plugin|MCP|hook|restricted/i);assert.equal(h.calls.length,0);
 }
});

test('CLI-looking model prompts remain data behind a positional separator',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'--disable-sandbox'});
 const args=h.calls.at(-1).args;assert.equal(args.at(-2),'--');assert.ok(args.at(-1).endsWith('\n\n--disable-sandbox'));assert.equal(args.includes('--disable-sandbox'),false);
});

test('managed shell uses a literal canonical workspace prefix and bounded native output',async t=>{
 const h=await harness(t),workspace=join(h.root,"team's project");await mkdir(workspace);
 await h.runtime.connect({binary:h.binary,workspaceRoot:workspace});await h.runtime.send({text:'Run project tests'});
 const args=h.calls.at(-1).args,prompt=args.at(-1);
 assert.equal(args.includes('--disable-shell'),false);assert.equal(args.includes('--enable-shell-tool'),false);
 assert.equal(args[args.indexOf('--max-tool-output-bytes')+1],'65536');
 assert.ok(prompt.includes(`Set-Location -LiteralPath '${workspace.replaceAll("'","''")}'`));
 assert.match(prompt,/independent/i);assert.match(prompt,/background|detached/i);assert.match(prompt,/human approval/i);
 assert.equal(args.some(arg=>/disable-sandbox|approval-mode|trust-workspace/.test(arg)),false);
});

test('profile workspaces retain file tools and explain shell unavailability',async t=>{
 const h=await harness(t),workspace=join(h.profile,'project');await mkdir(workspace);
 await h.runtime.connect({binary:h.binary,workspaceRoot:workspace});let state=h.runtime.snapshot();
 assert.equal(state.shellEnabled,false);assert.match(state.shellUnavailableReason,/profile|Windows/i);
 await h.runtime.send({text:'Edit project files'});const args=h.calls.at(-1).args;
 assert.ok(args.includes('--disable-shell'));assert.equal(args.at(-1),'Edit project files');
 assert.equal(h.runtime.snapshot().permissionVerified,true);
});

test('sandbox readiness is checked again before each model run and cannot degrade silently',async t=>{
 let healthy=true;const h=await harness(t,{ready:()=>healthy?ready:ready.replace('wfp_ready=true','wfp_ready=false')});await h.connect();
 healthy=false;await assert.rejects(h.runtime.send({text:'Run tests'}),/sandbox/i);
 assert.equal(h.calls.filter(call=>call.args[0]==='sandbox').length,2);
 assert.equal(h.calls.some(call=>call.args.includes('meta')),false);assert.equal(h.runtime.snapshot().permissionVerified,false);
});

test('native shell results preserve signed failures separately and clear for the next request',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Run a command'});
 const shellResult={command:'node.exe check.mjs',output:'Native failed status',exit_code:-2147483645,terminal_status:'failed',truncated:false};
 h.model().stdout.emit('data',Buffer.from(jsonl(records({shellResult}))));h.model().finish();await tick();
 const state=h.runtime.snapshot();assert.equal(state.status,'completed');assert.equal(state.shellResults[0].exitCode,-2147483645);assert.equal(state.shellResults[0].terminalStatus,'failed');
 assert.equal(state.messages.some(message=>message.text.includes('Native failed status')),false);
 state.shellResults[0].output='changed outside';assert.equal(h.runtime.snapshot().shellResults[0].output,'Native failed status');
 await h.runtime.send({text:'Another command'});assert.deepEqual(h.runtime.snapshot().shellResults,[]);
});

test('supervised native close without zero-job proof cannot verify completion or allow reconnect',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Run tests'});
 const child=h.model();child.isSupervised=true;child.cleanupConfirmed=false;
 child.stdout.emit('data',Buffer.from(jsonl(records())));child.finish();await tick();
 const state=h.runtime.snapshot();assert.equal(state.status,'uncertain');assert.equal(state.cleanup,'unconfirmed');assert.equal(state.liveVerified,false);assert.equal(state.permissionVerified,false);
 await assert.rejects(h.connect(),/shutdown|process/i);
});

test('a supervised zero-job close allows a native terminal to prove completion',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Run tests'});
 const child=h.model();child.isSupervised=true;child.cleanupConfirmed=true;
 child.stdout.emit('data',Buffer.from(jsonl(records())));child.finish();await tick();
 assert.equal(h.runtime.snapshot().status,'completed');assert.equal(h.runtime.snapshot().cleanup,'confirmed');
});

test('supervisor cancellation cannot turn a racing native completion into a verified run',async t=>{
 for(const terminationReason of ['timeout','ownerEof','stop']){
  const h=await harness(t);await h.connect();await h.runtime.send({text:'Run tests'});
  const child=h.model();child.isSupervised=true;child.cleanupConfirmed=true;child.terminationReason=terminationReason;
  child.stdout.emit('data',Buffer.from(jsonl(records())));child.finish(0);await tick();
  const state=h.runtime.snapshot();assert.equal(state.status,terminationReason==='stop'?'cancelled':'failed');assert.equal(state.liveVerified,false);assert.equal(state.permissionVerified,false);
  assert.equal(state.cleanup,'confirmed');assert.match(state.reason,/supervis|stopped|cancel/i);
 }
});

test('supervised stop uses ownership cleanup even when the native root already exited',async t=>{
 const h=await harness(t,{stopProcess:undefined});await h.connect();await h.runtime.send({text:'Run tests'});
 const child=h.model();child.isSupervised=true;child.cleanupConfirmed=false;child.exitCode=0;let stopped=false;
 child.stop=async()=>{stopped=true;child.cleanupConfirmed=true;child.finish(0);return true;};
 await h.runtime.disconnect();assert.equal(stopped,true);assert.equal(h.runtime.snapshot().cleanup,'confirmed');
});

test('an unconfirmed supervisor during startup cannot establish native permissions',async t=>{
 const h=await harness(t,{decorateChild:child=>{child.isSupervised=true;child.cleanupConfirmed=false;}});
 await assert.rejects(h.connect(),/ownership|cleanup/i);
 assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');assert.equal(h.runtime.snapshot().permissionVerified,false);
 assert.equal(h.calls.length,1);await assert.rejects(h.connect(),/shutdown|process/i);
});

test('a stop callback cannot override a missing supervised cleanup receipt',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Run tests'});
 h.model().isSupervised=true;h.model().cleanupConfirmed=false;
 await h.runtime.disconnect();assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');
 await assert.rejects(h.connect(),/shutdown|process/i);
});

test('unsupported approval stops the owner without permitting a decision',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});const sequence=records().slice(0,4);const last=sequence.at(-1);
 sequence.push({...last,id:'approval-record',sequence:last.sequence+1,payload_type:'approval.requested',payload:{kind:'approval_requested',command_id:'command-one',run_stream:{kind:'run',id:'run-one'}}});
 h.model().stdout.emit('data',Buffer.from(jsonl(sequence)));await tick();
 assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.runtime.snapshot().cleanup,'confirmed');assert.equal(h.runtime.snapshot().liveVerified,false);await assert.rejects(h.runtime.decide('allow'),/unavailable|no approval/i);
});

test('oversized native output fails closed and final text without model identity cannot prove a model run',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Edit'});h.model().stdout.emit('data',Buffer.from('x'.repeat(600000)));await tick();assert.equal(h.runtime.snapshot().status,'uncertain');
 const other=await harness(t);await other.connect();await other.runtime.send({text:'Edit'});other.model().stdout.emit('data',Buffer.from(jsonl(records({model:false}))));other.model().finish();await tick();assert.equal(other.runtime.snapshot().status,'uncertain');assert.equal(other.runtime.snapshot().liveVerified,false);
});

test('explicit budget reaches native step limit and runtime deadline metadata',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Investigate',runOptions:{reasoning:'high',approval:'ask',budget:'extended'}});
 const args=h.calls.findLast(c=>c.args.includes('meta')).args;assert.equal(args[args.indexOf('--max-model-steps')+1],'32');const state=h.runtime.snapshot();assert.equal(state.runLimits.steps,32);assert.equal(state.runLimits.wallTimeMs,900000);assert.equal(state.runLimits.tokenBudget,null);
});
test('model selection revalidates efforts, forwards exact model and retains sandbox and disabled web',async t=>{
 let calls=0;const catalog={source:'providerCatalog',models:[{id:'muse-spark-test',efforts:['low','high'],isDefault:true}]};const h=await harness(t,{loadModels:async()=>{calls++;return catalog;}});await h.connect();await h.runtime.refreshModels();
 await assert.rejects(h.runtime.send({text:'No',runOptions:{model:'muse-spark-test',reasoning:'ultra',approval:'ask'}}),/reasoning/);assert.equal(h.calls.some(c=>c.args.includes('meta')),false);
 await h.runtime.send({text:'Test',runOptions:{model:'muse-spark-test',reasoning:'low',approval:'ask'}});const args=h.calls.at(-1).args;assert.equal(args[args.indexOf('--model')+1],'muse-spark-test');assert.equal(args.includes('--disable-web-tools'),true);assert.equal(args.includes('--disable-sandbox'),false);assert.ok(args.includes('hooks={}'));assert.equal(calls,3);
});
test('disconnect during catalog lookup cannot start a later model request',async t=>{
 let release;const h=await harness(t,{loadModels:()=>new Promise(resolve=>{release=resolve;})});await h.connect();const pending=h.runtime.send({text:'Test',runOptions:{model:'muse-spark-test',reasoning:'low',approval:'ask'}});const failed=assert.rejects(pending,/interrupted|disconnected/i);const close=h.runtime.disconnect();release({source:'providerCatalog',models:[]});await failed;await close;assert.equal(h.calls.some(c=>c.args.includes('meta')),false);
});

test('selected model mismatch fails before accepting a completed run',async t=>{const h=await harness(t,{loadModels:async()=>({models:[{id:'expected-model',efforts:['high']}]})});await h.connect();await h.runtime.send({text:'Test',runOptions:{model:'expected-model',reasoning:'high',approval:'ask'}});h.model().stdout.emit('data',Buffer.from(jsonl(records())));await tick();assert.equal(h.runtime.snapshot().status,'uncertain');assert.match(h.runtime.snapshot().reason,/identity/);});
test('one-run project trust is included only after matching explicit review',async t=>{let trusted=false;const h=await harness(t,{extensionReview:{allowProject:async()=>trusted}});await h.connect();await h.runtime.send({text:'untrusted'});assert.equal(h.calls.at(-1).args.includes('--trust-workspace'),false);await h.runtime.disconnect();await h.connect();trusted=true;await h.runtime.send({text:'reviewed'});assert.equal(h.calls.at(-1).args.includes('--trust-workspace'),true);assert.ok(h.calls.at(-1).args.includes('hooks={}'));});
