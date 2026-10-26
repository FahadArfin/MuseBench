// Standalone ownership prototype. This is not imported by the product runtime.
import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {curateEnvironment} from '../src/runtime/index.mjs';

const runFile = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = file => fs.access(file).then(() => true, () => false);
const bounded = (promise, ms, label) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(`${label} timed out.`)), ms);
  })]).finally(() => clearTimeout(timer));
};

export async function compileSupervisor() {
  if(process.platform!=='win32')throw Error('This ownership probe requires Windows.');
  const source=path.join(root,'scripts','windows-job-probe.cs');
  const hash=createHash('sha256').update(await fs.readFile(source)).digest('hex').slice(0,16);
  const directory=path.join(root,'artifacts','windows-job-probe');
  const output=path.join(directory,`windows-job-${hash}.exe`);
  if(await exists(output))return output;
  await fs.mkdir(directory,{recursive:true});
  const compiler=path.join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  await runFile(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/r:System.Web.Extensions.dll',`/out:${output}`,source],{windowsHide:true,shell:false,timeout:30000,maxBuffer:65536});
  return output;
}

/** Probe-only native lifetime boundary. Model commands are never interpreted here.
 * `query(pid)` checks membership in this exact job; it does not claim that an
 * out-of-job native broker or worker is controlled by this supervisor. */
export async function startJob({exe,args=[],cwd,env=process.env,onEvent=()=>{},onStdout=()=>{},onStderr=()=>{},timeoutMs=180000}={}) {
  if(typeof exe!=='string'||!path.isAbsolute(exe)||!exe.toLowerCase().endsWith('.exe'))throw Error('An absolute native executable is required.');
  if(typeof cwd!=='string'||!path.isAbsolute(cwd))throw Error('An absolute working directory is required.');
  if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string'||arg.includes('\0')))throw Error('Arguments must be strings without NUL.');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)throw Error('Timeout must be 1–180000 ms.');
  const helper=await compileSupervisor();
  const child=spawn(helper,['--timeout-ms',String(timeoutMs),'--run',exe,cwd,'--',...args],{cwd,env:{...env},windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  const decoder=new StringDecoder('utf8');
  const requests=new Map();
  let buffer='',rawBytes=0,rootExitCode=null,cleanup=null,readyValue=null,protocolError=null,sequence=0,settled=false;
  let resolveReady,rejectReady,resolveCompletion;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
  const completion=new Promise(resolve=>{resolveCompletion=resolve;});
  const fail=error=>{protocolError??=error;rejectReady(error);child.kill();};
  child.stdout.on('data',chunk=>{
    rawBytes+=chunk.length;if(rawBytes>16*1024*1024){fail(Error('Supervisor output exceeded its bound.'));return;}
    buffer+=decoder.write(chunk);
    if(buffer.length>1024*1024&&!buffer.includes('\n')){fail(Error('Supervisor frame exceeded its bound.'));return;}
    let newline;
    while((newline=buffer.indexOf('\n'))!==-1){
      const raw=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!raw.trim())continue;
      try{
        const event=JSON.parse(raw);
        if(!event||typeof event!=='object'||typeof event.kind!=='string')throw Error('Malformed supervisor event.');
        if(event.kind==='stdout'||event.kind==='stderr'){
          if(typeof event.data!=='string'||event.data.length>1024*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.data))throw Error('Malformed supervisor byte frame.');
          (event.kind==='stdout'?onStdout:onStderr)(Buffer.from(event.data,'base64'));
        }else{
          if(event.kind==='ready'){readyValue=event;resolveReady(event);}
          if(event.kind==='rootExit')rootExitCode=event.exitCode;
          if(event.kind==='cleanup')cleanup=event;
          if(event.kind==='error')protocolError??=Error(event.message??'Supervisor failed.');
          if(event.requestId&&requests.has(event.requestId)){requests.get(event.requestId).resolve(event);requests.delete(event.requestId);}
          onEvent(event);
        }
      }catch(error){fail(error);return;}
    }
  });
  // The native child's stderr is framed above. Unframed helper diagnostics are
  // never interpreted as native events or success receipts.
  child.stderr.on('data',()=>{protocolError??=Error('Supervisor emitted an unframed diagnostic.');});
  child.stdin.on('error',()=>{});
  child.once('error',error=>{protocolError??=error;rejectReady(error);});
  child.once('close',(code,signal)=>{
    settled=true;buffer+=decoder.end();if(buffer.trim())protocolError??=Error('Incomplete supervisor frame.');
    if(!readyValue)rejectReady(protocolError??Error('Supervisor exited before ownership was established.'));
    for(const request of requests.values())request.reject(Error('Supervisor exited.'));requests.clear();
    resolveCompletion({code,signal,rootExitCode,cleanup,ready:readyValue,error:protocolError?.message??null});
  });
  const request=async(action,fields={})=>{
    if(settled||child.stdin.destroyed)throw Error('Supervisor has exited.');
    const requestId=`query-${++sequence}`;
    const response=new Promise((resolve,reject)=>{requests.set(requestId,{resolve,reject});});
    child.stdin.write(JSON.stringify({action,requestId,...fields})+'\n');
    return bounded(response,5000,'Supervisor query').finally(()=>requests.delete(requestId));
  };
  await bounded(ready,10000,'Supervisor startup').catch(error=>{child.kill();throw error;});
  return {
    child,helper,ready,completion,
    query(pid){if(!Number.isSafeInteger(pid)||pid<1)throw Error('A valid PID is required.');return request('query',{pid});},
    status:()=>request('status'),
    async stop(){if(!settled&&!child.stdin.destroyed)child.stdin.write(JSON.stringify({action:'stop'})+'\n');return bounded(completion,8000,'Supervisor stop');},
    closeInput(){child.stdin.end();},
  };
}

async function selfTest({museBinary} = {}) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'musebench-job-'));
  const receipts = [];
  const observe = event => receipts.push(event);
  // Real behavior: unowned detached children can create this delayed marker.
  // Job lifetime must prevent it after cancellation or supervisor termination.
  const markerProgram = marker => `process.stdout.write('CHILD_READY\\n');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'survived'),1800);setTimeout(()=>{},10000);`;
  const spawner = marker => `const cp=require('node:child_process');const c=cp.spawn(process.execPath,['-e',${JSON.stringify(markerProgram(marker))}],{detached:true,stdio:['ignore','pipe','ignore'],windowsHide:true});c.stdout.once('data',()=>{console.log(JSON.stringify({grandchild:c.pid}));c.stdout.destroy();c.unref();});setInterval(()=>{},1000);`;
  const checks = [];
  let active;
  try {
    const controlMarker=path.join(directory,'positive-control.txt');
    await runFile(process.execPath,['-e',markerProgram(controlMarker).replace('1800','100').replace('10000','200')],{cwd:directory,windowsHide:true,shell:false,timeout:3000});
    assert.equal(await exists(controlMarker),true,'Uncontained marker fixture must be able to write');
    checks.push('Positive control proves marker fixture writes without containment');
    let out = '', err = '';
    active = await startJob({exe:process.execPath,args:['-e','process.stdout.write("out✓");process.stderr.write("err✓");process.exit(7)'],cwd:directory,onEvent:observe,onStdout:b=>{out+=b.toString();},onStderr:b=>{err+=b.toString();}});
    const completed = await bounded(active.completion, 8000, 'Exit propagation');
    assert.equal(completed.rootExitCode,7); assert.equal(completed.code,7);assert.equal(completed.error,null);
    assert.equal(completed.cleanup?.confirmed,true); assert.equal(out,'out✓'); assert.equal(err,'err✓');
    checks.push('Child bytes, nonzero exit, and cleanup receipt preserved');

    const argvFixture=['','two words','a"b','C:\\trailing\\','line1\nline2','$(never execute); &','Unicode ✓'];
    let argumentsOutput='';
    active=await startJob({exe:process.execPath,args:['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))','--',...argvFixture],cwd:directory,onEvent:observe,onStdout:b=>{argumentsOutput+=b.toString();}});
    const argumentsRun=await bounded(active.completion,8000,'Argument preservation');
    assert.equal(argumentsRun.code,0);assert.equal(argumentsRun.cleanup?.confirmed,true);
    assert.deepEqual(JSON.parse(argumentsOutput),argvFixture);
    checks.push('Native argv preserves empty, quoted, multiline and shell-looking data');

    for (const mode of ['stop','eof','timeout','supervisor-kill']) {
      const marker = path.join(directory,`${mode}.txt`);
      let line='', readyResolve;
      const descendant = new Promise(resolve => {readyResolve=resolve;});
      active = await startJob({exe:process.execPath,args:['-e',spawner(marker)],cwd:directory,timeoutMs:mode==='timeout'?1200:180000,onEvent:observe,onStdout:chunk=>{line+=chunk.toString();const end=line.indexOf('\n');if(end!==-1)readyResolve(JSON.parse(line.slice(0,end)));}});
      const child = await bounded(descendant,5000,`${mode} child startup`);
      const query = await active.query(child.grandchild);
      assert.equal(query.inJob,true,'Detached grandchild must belong to exact owner job');
      const status=await active.status();
      assert.ok(status.activeProcesses>=2);assert.ok(status.pids.includes(child.grandchild));
      assert.equal((await active.query(process.pid)).inJob,false,'Unrelated Node owner must remain outside run job');
      if(mode==='stop')await active.stop();
      else if(mode==='eof')active.closeInput();
      else if(mode==='supervisor-kill')active.child.kill();
      const stopped = await bounded(active.completion,8000,`${mode} cleanup`);
      if(mode!=='supervisor-kill')assert.equal(stopped.cleanup?.confirmed,true);
      await wait(2200);
      assert.equal(await exists(marker),false,`${mode} must prevent delayed marker`);
      checks.push(`${mode}: detached descendant killed; unrelated owner unaffected`);
    }

    const naturalMarker=path.join(directory,'natural-exit.txt');
    const naturalSpawner=spawner(naturalMarker).replace('setInterval(()=>{},1000);','setTimeout(()=>process.exit(0),250);');
    active=await startJob({exe:process.execPath,args:['-e',naturalSpawner],cwd:directory,onEvent:observe});
    const natural=await bounded(active.completion,8000,'Natural parent exit');
    assert.equal(natural.rootExitCode,0);assert.equal(natural.cleanup?.confirmed,true);
    await wait(2200);assert.equal(await exists(naturalMarker),false);
    checks.push('Natural root exit drains owned detached descendant');

    if(museBinary) {
      const env=curateEnvironment(process.env);
      for(const args of [['--version'],['exec','--provider','echo','--json','--workspace',directory,'--permission-profile',':ask-me','--no-session-log','--disable-shell','--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--max-model-steps','1','-c','hooks={}','-c','managed_hooks_path=null','--','MUSEBENCH_JOB_ECHO_ONLY']]){
        let output='';
        active=await startJob({exe:museBinary,args,cwd:directory,env,onEvent:observe,onStdout:b=>{output+=b.toString();},timeoutMs:15000});
        const native=await bounded(active.completion,20000,'Inert native probe');
        assert.equal(native.code,0);assert.equal(native.rootExitCode,0);assert.equal(native.cleanup?.confirmed,true);
        if(args[0]==='--version')assert.match(output,/1\.4\.13/);
        else assert.ok(output.split('\n').filter(Boolean).map(JSON.parse).some(r=>r.payload_type==='run.terminal.completed'));
        checks.push(`Native ${args[0]==='--version'?'version':'echo'} works inside owner job (no model)`);
      }
    }
    const helper=await compileSupervisor();
    const report={status:'passed',checks,receipts,directory,helper,
      helperSha256:createHash('sha256').update(await fs.readFile(helper)).digest('hex'),
      sourceSha256:createHash('sha256').update(await fs.readFile(path.join(root,'scripts','windows-job-probe.cs'))).digest('hex'),
      wrapperSha256:createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),
      at:new Date().toISOString()};
    const reportPath=path.join(root,'artifacts','windows-job-probe',`self-test-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:report.status,checks,reportPath},null,2));
  } finally {
    if(active?.child.exitCode===null){await active.stop().catch(()=>{});active.closeInput();}
    // Retain the small disposable directory for marker inspection/provenance.
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args[0]==='--self-test'){
    const at=args.indexOf('--muse-bin');
    await selfTest({museBinary:at>=0?args[at+1]:undefined}).catch(error=>{console.error(error.message);process.exitCode=1;});
  } else {
    console.log('Usage: node scripts/windows-job-probe.mjs --self-test [--muse-bin ABS_NATIVE_EXE]\nImport startJob({exe,args,cwd,env,onStdout,onStderr,onEvent}) for later bounded probes. No product runtime integration.');
  }
}
