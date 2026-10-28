import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';

export const DESKTOP_TARGETS=['win32-x64','win32-arm64','linux-x64','linux-arm64','darwin-x64','darwin-arm64'];
export const RELEASE_TARGETS=[...DESKTOP_TARGETS,'android-universal'];
const digest=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest(algorithm==='sha512'?'base64':'hex');
const safe=name=>typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(name);
function identity(version,commit){if(!/^\d+\.\d+\.\d+$/.test(version)||! /^[a-f0-9]{40}$/.test(commit))throw Error('Invalid release version or source commit.');}
function coverage(names,platform,arch,version){
 if(platform==='android') { if(!names.includes(`MuseBench-${version}-android.apk`))throw Error('Missing Android APK.'); return; }
 const expected=platform==='win32'?[`MuseBench-Setup-${version}${arch==='arm64'?'-arm64':''}.exe`,'latest.yml']:platform==='linux'?[`MuseBench-${version}-linux-${arch==='x64'?'x86_64':arch}.AppImage`,`MuseBench-${version}-linux-${arch==='x64'?'amd64':arch}.deb`,`latest-linux${arch==='x64'?'':'-'+arch}.yml`]:[`MuseBench-${version}-mac-${arch}.dmg`,`MuseBench-${version}-mac-${arch}.zip`,'latest-mac.yml'];
 for(const name of expected)if(!names.includes(name))throw Error(`Missing release artifact ${name}.`);
}
async function metadataAt(directory,name,version,names){
 const value=yaml.load(await readFile(path.join(directory,name),'utf8'));
 if(value?.version!==version||!Array.isArray(value.files)||!value.files.length)throw Error(`Invalid update version or files in ${name}.`);
 for(const item of value.files){
  if(!safe(item.url)||!names.includes(item.url))throw Error(`Invalid update download in ${name}.`);
  const bytes=await readFile(path.join(directory,item.url));
  if(item.sha512!==digest(bytes,'sha512')||item.size!==bytes.length)throw Error(`Update digest mismatch for ${item.url}.`);
 }
 if(value.path&&(value.path!==value.files[0].url||value.sha512!==value.files[0].sha512))throw Error(`Legacy update digest mismatch in ${name}.`);
 if(value.packages)throw Error('Unvalidated update package map.');
 return value;
}

export async function stageRelease({releaseDir,outDir,platform,arch,version,commit}){
 identity(version,commit);if(!RELEASE_TARGETS.includes(`${platform}-${arch}`))throw Error('Unsupported release target.');
 const names=(await readdir(releaseDir)).filter(name=>safe(name)&&((name.startsWith('MuseBench-')&&name.includes(version)&&/\.(exe|blockmap|AppImage|deb|dmg|zip|apk)$/.test(name))||/^latest(?:-[a-z0-9-]+)?\.yml$/.test(name)));
 coverage(names,platform,arch,version);
 for(const name of names.filter(n=>n.endsWith('.yml')))await metadataAt(releaseDir,name,version,names);
 await mkdir(outDir,{recursive:true});const files=[];
 for(const name of names){const bytes=await readFile(path.join(releaseDir,name));files.push({name,size:bytes.length,sha256:digest(bytes)});await copyFile(path.join(releaseDir,name),path.join(outDir,name));}
 await writeFile(path.join(outDir,'asset-manifest.json'),JSON.stringify({version,commit,platform,arch,files},null,2)+'\n');
}

export async function collectRelease({inputDir,outputDir,expectedTargets=RELEASE_TARGETS,version,commit}){
 identity(version,commit);const targets=new Map(),files=new Map(),metadata=new Map();
 for(const entry of await readdir(inputDir,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const directory=path.join(inputDir,entry.name),manifest=JSON.parse(await readFile(path.join(directory,'asset-manifest.json'),'utf8'));
  const target=`${manifest.platform}-${manifest.arch}`;
  if(!expectedTargets.includes(target)||targets.has(target))throw Error(`Unexpected or duplicate target ${target}.`);
  if(manifest.version!==version)throw Error(`Mixed release version in ${target}.`);
  if(manifest.commit!==commit)throw Error(`Mixed source commit in ${target}.`);
  if(!Array.isArray(manifest.files))throw Error('Missing artifact manifest.');
  const names=manifest.files.map(f=>f.name);coverage(names,manifest.platform,manifest.arch,version);
  for(const item of manifest.files){
   if(!safe(item.name))throw Error('Unsafe artifact name.');
   const bytes=await readFile(path.join(directory,item.name));
   if(bytes.length!==item.size||digest(bytes)!==item.sha256)throw Error(`Artifact integrity hash mismatch: ${item.name}.`);
   if(item.name.endsWith('.yml')){
    const value=await metadataAt(directory,item.name,version,names),group=metadata.get(item.name)??[];
    group.push({arch:manifest.arch,value});metadata.set(item.name,group);
   }else{
    if(files.has(item.name))throw Error(`Duplicate release asset ${item.name}.`);
    files.set(item.name,bytes);
   }
  }
  targets.set(target,manifest);
 }
 for(const target of expectedTargets)if(!targets.has(target))throw Error(`Missing target ${target}.`);
 for(const [name,group] of metadata){
  group.sort((a,b)=>(a.arch==='x64'?0:1)-(b.arch==='x64'?0:1));
  const combined={...group[0].value,files:group.flatMap(item=>item.value.files)};
  if(new Set(combined.files.map(f=>f.url)).size!==combined.files.length)throw Error(`Duplicate update downloads in ${name}.`);
  files.set(name,Buffer.from(yaml.dump(combined)));
 }
 files.set('release-manifest.json',Buffer.from(JSON.stringify({version,commit,targets:[...targets.values()]},null,2)+'\n'));
 await mkdir(outputDir,{recursive:true});
 for(const [name,bytes] of files)await writeFile(path.join(outputDir,name),bytes);
 await writeFile(path.join(outputDir,'SHA256SUMS'),[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,bytes])=>`${digest(bytes)}  ${name}\n`).join(''));
 return{version,commit,targets:[...targets.keys()],assets:files.size+1};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const packageInfo=JSON.parse(await readFile('package.json','utf8'));
 const common={version:process.env.VERSION||packageInfo.version,commit:process.env.SOURCE_SHA||packageInfo.releaseCommit};
 if(process.argv[2]==='stage')await stageRelease({...common,releaseDir:'release',outDir:'release-assets',platform:process.argv.includes('--android')?'android':process.platform,arch:process.argv.includes('--android')?'universal':process.arch});
 else if(process.argv[2]==='collect')console.log(await collectRelease({...common,inputDir:'incoming',outputDir:'release'}));
 else throw Error('Use stage or collect.');
}
