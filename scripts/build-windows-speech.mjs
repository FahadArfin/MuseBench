import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const source='native/windows-speech.cs',output='native/bin/MuseBenchSpeech.exe',manifest='native/bin/MuseBenchSpeech.build.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceSha256=hash(readFileSync(source));
let previous;try{previous=JSON.parse(readFileSync(manifest));}catch{}
if(previous?.sourceSha256===sourceSha256&&existsSync(output)&&previous.exeSha256===hash(readFileSync(output))) console.log('Windows speech helper verified');
else {
 if(process.platform!=='win32')throw Error('Build Windows speech helper on Windows.');
 const compiler=path.join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const assembly=path.join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET/assembly/GAC_MSIL/System.Speech/v4.0_4.0.0.0__31bf3856ad364e35/System.Speech.dll');
 mkdirSync('native/bin',{recursive:true});
 execFileSync(compiler,['/nologo','/target:exe','/platform:x64',`/out:${path.resolve(output)}`,`/reference:${assembly}`,'/reference:System.Web.Extensions.dll',path.resolve(source)],{windowsHide:true,timeout:30000});
 writeFileSync(manifest,JSON.stringify({source,sourceSha256,exeSha256:hash(readFileSync(output)),builtAt:new Date().toISOString()},null,2));
 console.log('Windows speech helper compiled');
}
