import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {createRequire} from 'node:module';
const {findFile}=createRequire(import.meta.url)('electron-updater/out/providers/Provider.js');
import {stageRelease,collectRelease} from '../scripts/release-assets.mjs';
const sha=value=>createHash('sha512').update(value).digest('base64'),version='0.2.999',commit='a'.repeat(40);
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'muse-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function windows(root,arch){const releaseDir=path.join(root,'raw-'+arch);await mkdir(releaseDir);const name=`MuseBench-Setup-${version}${arch==='arm64'?'-arm64':''}.exe`,bytes=Buffer.from('installer-'+arch);await writeFile(path.join(releaseDir,name),bytes);await writeFile(path.join(releaseDir,name+'.blockmap'),'blockmap');await writeFile(path.join(releaseDir,'latest.yml'),yaml.dump({version,files:[{url:name,sha512:sha(bytes),size:bytes.length}],path:name,sha512:sha(bytes),releaseDate:'2026-10-28T00:00:00Z'}));await stageRelease({releaseDir,outDir:path.join(root,'input',`win32-${arch}`),platform:'win32',arch,version,commit});return name;}
test('one release retains both Windows architectures and the existing x64 updater fallback',async t=>{
 const root=await fixture(t),x64=await windows(root,'x64'),arm=await windows(root,'arm64');
 await collectRelease({inputDir:path.join(root,'input'),outputDir:path.join(root,'out'),expectedTargets:['win32-x64','win32-arm64'],version,commit});
 const metadata=yaml.load(await readFile(path.join(root,'out','latest.yml'),'utf8'));
 assert.deepEqual(metadata.files.map(f=>f.url),[x64,arm]);assert.equal(metadata.path,x64);
 assert.equal(metadata.files[1].sha512,sha(Buffer.from('installer-arm64')));assert.match(await readFile(path.join(root,'out','SHA256SUMS'),'utf8'),/arm64\.exe/);
 const descriptor=Object.getOwnPropertyDescriptor(process,'arch');
 try{for(const [arch,wanted] of [['x64',x64],['arm64',arm]]){Object.defineProperty(process,'arch',{...descriptor,value:arch});assert.equal(findFile(metadata.files.map(info=>({url:new URL('https://example.invalid/'+info.url),info})),'exe').info.url,wanted);}}finally{Object.defineProperty(process,'arch',descriptor);}
});
test('release collection refuses a missing target, mixed source and changed package bytes',async t=>{
 const root=await fixture(t);await windows(root,'x64');const options={inputDir:path.join(root,'input'),outputDir:path.join(root,'out'),expectedTargets:['win32-x64','win32-arm64'],version,commit};
 await assert.rejects(collectRelease(options),/Missing.*arm64/);await windows(root,'arm64');
 await assert.rejects(collectRelease({...options,commit:'b'.repeat(40)}),/source|commit/i);
 await assert.rejects(collectRelease({...options,version:'0.2.998'}),/version/i);
 await writeFile(path.join(root,'input','win32-arm64',`MuseBench-Setup-${version}-arm64.exe`),'changed');
 await assert.rejects(collectRelease(options),/hash|integrity|digest/i);
});
test('staging rejects updater metadata whose download digest does not match its installer',async t=>{
 const root=await fixture(t);await windows(root,'x64');const releaseDir=path.join(root,'raw-x64');const metadata=yaml.load(await readFile(path.join(releaseDir,'latest.yml'),'utf8'));metadata.files[0].sha512=sha('wrong');await writeFile(path.join(releaseDir,'latest.yml'),yaml.dump(metadata));
 await assert.rejects(stageRelease({releaseDir,outDir:path.join(root,'bad'),platform:'win32',arch:'x64',version,commit}),/digest|hash/i);
});
test('Linux x64 staging accepts electron-builder native artifact architecture names',async t=>{
 const root=await fixture(t),releaseDir=path.join(root,'raw');await mkdir(releaseDir);
 const app=`MuseBench-${version}-linux-x86_64.AppImage`,deb=`MuseBench-${version}-linux-amd64.deb`,bytes=Buffer.from('linux-fixture');
 for(const name of [app,deb])await writeFile(path.join(releaseDir,name),bytes);
 await writeFile(path.join(releaseDir,'latest-linux.yml'),yaml.dump({version,files:[{url:app,sha512:sha(bytes),size:bytes.length}],path:app,sha512:sha(bytes)}));
 await stageRelease({releaseDir,outDir:path.join(root,'input','linux'),platform:'linux',arch:'x64',version,commit});
 await collectRelease({inputDir:path.join(root,'input'),outputDir:path.join(root,'out'),expectedTargets:['linux-x64'],version,commit});
 assert.deepEqual(await readFile(path.join(root,'out',deb)),bytes);
});

test('Android APK is required, hashed and tied to the same source release',async t=>{
 const root=await fixture(t),releaseDir=path.join(root,'raw-android');await mkdir(releaseDir);
 const name=`MuseBench-${version}-android.apk`;await writeFile(path.join(releaseDir,name),'signed-apk-fixture');
 await stageRelease({releaseDir,outDir:path.join(root,'input','android'),platform:'android',arch:'universal',version,commit});
 await collectRelease({inputDir:path.join(root,'input'),outputDir:path.join(root,'out'),expectedTargets:['android-universal'],version,commit});
 assert.match(await readFile(path.join(root,'out','SHA256SUMS'),'utf8'),/android\.apk/);
 await writeFile(path.join(root,'input','android',name),'changed');
 await assert.rejects(collectRelease({inputDir:path.join(root,'input'),outputDir:path.join(root,'out'),expectedTargets:['android-universal'],version,commit}),/hash|integrity/i);
});
