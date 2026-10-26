import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {promisify} from 'node:util';
import {EXPECTED_SCHEMA_FINGERPRINT,spawnMspConnection} from '@muse-code/sdk';
import {curateEnvironment, discoverMuseBinaries,parseMuseVersion} from '../src/runtime/index.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';
import {probeEligibility} from './harness-safety.mjs';

// Explicit, read-only native preflight. Never opens a session or submits a turn.
const binary=process.argv[2]??discoverMuseBinaries()[0];
if(!binary||!path.isAbsolute(binary)||(process.platform==='win32'&&!binary.toLowerCase().endsWith('.exe')))
 throw Error('Supply the absolute path of the official native Muse executable.');
const output=path.resolve('artifacts/muse-install/verification.json');
const env=curateEnvironment();
const run=promisify(execFile);
const report={checkedAt:new Date().toISOString(),binary,modelCallAttempted:false,sessionCreated:false};
const require=createRequire(import.meta.url);
report.sdkVersion=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8')).version;
const hash=createHash('sha256');
for await(const chunk of createReadStream(binary))hash.update(chunk);
report.binarySha256=hash.digest('hex');
report.version=(await run(binary,['--version'],{env,windowsHide:true,shell:false,timeout:5000,maxBuffer:16384})).stdout.trim();
if(process.platform==='win32'){
 try{
  const result=await run(binary,['sandbox','windows','check'],{env,windowsHide:true,shell:false,timeout:10000,maxBuffer:16384});
  const allowed=new Set(['backend','status','runner_trusted','runner_version_matches','sandbox_users_ready','capabilities_ready','restricted_network_required','wfp_ready']);
  report.windowsSandboxCheck={exitCode:0,...Object.fromEntries(result.stdout.split(/\r?\n/).map(line=>line.split('=')).filter(([key])=>allowed.has(key)))};
 }catch(error){report.windowsSandboxCheck={exitCode:error.code??null,status:'not-ready'};}
}
let owner;
let initializeTimer;
try{
 if(parseMuseVersion(report.version)!==TARGET.hostVersion)throw Object.assign(Error('CLI version mismatch'),{code:'CLI_VERSION_MISMATCH'});
 if(report.sdkVersion!==TARGET.sdkVersion||EXPECTED_SCHEMA_FINGERPRINT!==TARGET.fingerprint)throw Object.assign(Error('SDK compatibility mismatch'),{code:'SDK_PIN_MISMATCH'});
 owner=spawnMspConnection({command:binary,args:['serve'],cwd:process.cwd(),env,shutdownTimeoutMs:10000});
 const host=await Promise.race([
  owner.initialize({clientInfo:{name:'musebench_probe',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:false}}),
  new Promise((_,reject)=>{initializeTimer=setTimeout(()=>reject(Object.assign(new Error('Initialize timed out'),{code:'INITIALIZE_TIMEOUT'})),10000);}),
 ]);
 const h=host.initializeResult;
 report.handshake={serverInfo:h.serverInfo,schema:h.schema,platformOs:h.platformOs,experimentalApi:h.experimentalApi,sandboxAvailability:h.sandboxAvailability??'unknown',sandboxUnavailableReason:h.sandboxUnavailableReason??null};
 const eligibility=probeEligibility({sdkVersion:report.sdkVersion,sdkFingerprint:EXPECTED_SCHEMA_FINGERPRINT,version:report.version,initializeResult:h});
 report.compatibility={available:eligibility.available,reason:eligibility.reason};
 report.status=eligibility.status;
}catch(error){report.status='probe-failed';report.errorCode=error.code??error.name;}
finally{
 clearTimeout(initializeTimer);
 if(owner){try{await owner.close();report.hostShutdown='confirmed';}catch{report.hostShutdown='unconfirmed';}}
 await mkdir(path.dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
console.log('Evidence: '+output);
if(report.status!=='host-eligible-not-model-tested'||report.hostShutdown!=='confirmed')process.exitCode=2;
