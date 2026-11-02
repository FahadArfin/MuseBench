import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source='native/windows-desktop.cs',output='native/bin/MuseBenchDesktop.exe',manifest='native/bin/MuseBenchDesktop.build.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceSha256=hash(readFileSync(source));
const builderSha256=hash(readFileSync(fileURLToPath(import.meta.url)));
let previous;try{previous=JSON.parse(readFileSync(manifest));}catch{}
if(previous?.platform==='anycpu'&&previous.sourceSha256===sourceSha256&&previous.builderSha256===builderSha256&&existsSync(output)&&previous.exeSha256===hash(readFileSync(output)))console.log('Windows desktop helper verified');
else {
 if(process.platform!=='win32')throw Error('Build Windows desktop helper on Windows.');
 const root=process.env.SystemRoot??'C:\\Windows',compiler=path.join(root,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const gac=name=>path.join(root,'Microsoft.NET/assembly/GAC_MSIL',name,'v4.0_4.0.0.0__31bf3856ad364e35',`${name}.dll`);
 mkdirSync('native/bin',{recursive:true});
 execFileSync(compiler,['/nologo','/target:exe','/platform:anycpu',`/out:${path.resolve(output)}`,'/reference:System.Web.Extensions.dll','/reference:System.Drawing.dll',...['UIAutomationClient','UIAutomationTypes','WindowsBase'].map(name=>`/reference:${gac(name)}`),path.resolve(source)],{windowsHide:true,timeout:30000});
 writeFileSync(manifest,JSON.stringify({platform:'anycpu',source,sourceSha256,builderSha256,exeSha256:hash(readFileSync(output)),builtAt:new Date().toISOString()},null,2));
 console.log('Windows desktop helper compiled');
}
