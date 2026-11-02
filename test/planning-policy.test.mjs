import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {applyPlanningArgs,assertPlanningTransport,verifyPlanningConfiguration} from '../src/runtime/planning-policy.mjs';

const base=(extra=[])=>['exec','--provider','meta','--json','--workspace',path.resolve('fixture'),...extra,'--','Plan this request.'];
const values=(args,name)=>args.flatMap((value,index)=>value===name?[args[index+1]]:[]);

test('read-only plans retain only native file reads and search even on a Full access connection',()=>{
 const original=base(['--disable-sandbox','--permission-profile',':ask-me','--approval-judge','on','--contributor-mode','on','-c','hooks={"Stop":[]}','-c','managed_hooks_path="reviewed.json"']);
 const before=[...original],args=applyPlanningArgs(original),flags=args.slice(0,args.indexOf('--'));
 assert.deepEqual(original,before);
 assert.equal(flags.includes('--disable-sandbox'),false);
 for(const flag of ['--disable-write','--disable-shell','--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--no-session-log'])assert.equal(flags.includes(flag),true,flag);
 assert.deepEqual(values(flags,'--permission-profile'),[':read-only']);
 assert.deepEqual(values(flags,'--contributor-mode'),['off']);
 assert.deepEqual(values(flags,'--approval-judge'),[]);
 assert.deepEqual(values(flags,'-c').sort(),['hooks={}','managed_hooks_path=null','run.toolset=["read_file","search"]'].sort());
 assert.equal(args.at(-1),'Plan this request.');
 assert.deepEqual(applyPlanningArgs(args),args);
});

test('native shell, workflow, plugin or hook configuration cannot widen a planning run',()=>{
 for(const extra of [
  ['--yolo'],['--trust-workspace'],['--session-id','retained-session'],['--worktree','create'],['-w'],['--allow-workspace-switch'],['--enable-shell-tool'],['--agents','{}'],['--future-tool-enabler'],
  ['-c','mcpServers={"private-secret":"value"}'],['--config','runtime_capabilities={}'],['-c','run.code_mode=true'],['--preset','custom'],['--model','--yolo'],['--provider','local'],
 ])assert.throws(()=>applyPlanningArgs(base(extra)),error=>error.code==='PLAN_BOUNDARY_UNAVAILABLE'&&error.inputAdmission==='not-sent'&&!error.message.includes('private-secret'),JSON.stringify(extra));
 const rewritten=applyPlanningArgs(base(['-c','run.toolset=["powershell","write_file","workflow"]','-c','tools.web_fetch.enabled=true','--preset','empty']));
 assert.deepEqual(values(rewritten,'-c').sort(),['hooks={}','managed_hooks_path=null','run.toolset=["read_file","search"]'].sort());
});

test('prompt text resembling flags remains prompt data and prompt files remain supported',()=>{
 const args=applyPlanningArgs(['exec','--workspace',path.resolve('fixture'),'--','--yolo -c run.toolset=["powershell"]']);
 assert.equal(args.at(-1),'--yolo -c run.toolset=["powershell"]');
 const file=path.resolve('prompt.txt'),prepared=applyPlanningArgs(['exec','--workspace',path.resolve('fixture'),'--prompt-file',file]);
 assert.deepEqual(values(prepared,'--prompt-file'),[file]);
 for(const invalid of [null,[],['serve'],['exec','--workspace'],['exec','--config'],['exec',42],['exec','unexpected-positional']])assert.throws(()=>applyPlanningArgs(invalid),{code:'PLAN_BOUNDARY_UNAVAILABLE'});
});

test('an existing MSP session cannot admit a prompt-only planning turn',()=>{
 assert.doesNotThrow(()=>assertPlanningTransport({mode:'chat',transport:'msp'}));
 assert.doesNotThrow(()=>assertPlanningTransport({mode:'plan',transport:'exec'}));
 assert.throws(()=>assertPlanningTransport({mode:'plan',transport:'msp'}),{code:'PLAN_BOUNDARY_UNAVAILABLE',inputAdmission:'not-sent'});
 assert.throws(()=>assertPlanningTransport({mode:'plan',transport:'unknown'}),{code:'PLAN_BOUNDARY_UNAVAILABLE'});
});

async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'musebench-plan-policy-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const profile=path.join(root,'profile'),workspaceRoot=path.join(root,'project'),config=path.join(profile,'.config','muse'),data=path.join(profile,'.local','share','muse');
 await mkdir(config,{recursive:true});await mkdir(workspaceRoot);
 return{root,config,data,workspaceRoot,environment:{USERPROFILE:profile},platform:'win32'};
}

test('planning configuration is checked without extension review grants and preserves settings',async t=>{
 const f=await fixture(t),settings=path.join(f.config,'settings.json');
 const source=JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',commandWindows:'echo user hook'}]}]},managed_hooks_path:'unreviewed.json'});
 await writeFile(settings,source);await verifyPlanningConfiguration(f);assert.equal(await readFile(settings,'utf8'),source);
 await writeFile(settings,JSON.stringify({mcpServers:{docs:{type:'stdio',command:'node',args:['private-server.js']}}}));
 let granted=0;
 await assert.rejects(verifyPlanningConfiguration({...f,extensionReview:{allowMcp:async()=>{granted++;return true;}}}),/MCP|configuration|review/);
 assert.equal(granted,0);
 await writeFile(settings,'{}');await mkdir(path.join(f.data,'plugins'),{recursive:true});await writeFile(path.join(f.data,'plugins','installed.json'),'{}');
 await assert.rejects(verifyPlanningConfiguration({...f,extensionReview:{allowFile:async()=>true}}),/plugin inventory/);
});

test('saved trust, project and ancestor MCP sources fail closed before native dispatch',async t=>{
 const f=await fixture(t),trust=path.join(f.config,'trust.json'),mcp=path.join(f.root,'.mcp.json');
 await writeFile(trust,'{}');await assert.rejects(verifyPlanningConfiguration(f),/saved workspace trust/);await rm(trust);
 await writeFile(mcp,'{}');await assert.rejects(verifyPlanningConfiguration(f),/project MCP/);await rm(mcp);
 await mkdir(path.join(f.workspaceRoot,'.muse'));await writeFile(path.join(f.workspaceRoot,'.muse','hooks.json'),'{}');
 await assert.rejects(verifyPlanningConfiguration(f),/project hooks/);
});
