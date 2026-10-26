import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {discoverMuseBinaries, SETUP_URL} from '../src/runtime/index.mjs';

const require=createRequire(import.meta.url);
let sdkVersion=null;
try{sdkVersion=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8')).version;}catch{}
const candidates=discoverMuseBinaries();
console.log(JSON.stringify({runtime:candidates.length?'candidate-found-not-executed':'unavailable',candidates,sdkVersion,nodeVersion:process.version,platform:process.platform,liveVerified:false,setupUrl:SETUP_URL,action:'Discovery only: PATH and the official Windows install folder were checked. No native binary, host, account or model was invoked.',next:candidates.length?'Select your trusted official native executable in MuseBench and connect to verify compatibility.':'Install Muse using the official setup page. On Windows the version marker selects muse-bin-<version>.exe in the install folder; an unversioned muse.exe is also supported. MuseBench does not execute the auto-updating muse.cmd launcher.'},null,2));
