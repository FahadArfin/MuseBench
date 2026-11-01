import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);

test('build tool glob matching uses the patched API and packs/unpacks the same files',async()=>{
 const asar=require('@electron/asar');
 const fromAsar=createRequire(require.resolve('@electron/asar'));
 const minimatch=fromAsar('minimatch');
 const version=fromAsar('minimatch/package.json').version;
 assert(Number(version.split('.')[0])>=11,'ASAR must resolve the patched matcher, not the vulnerable legacy API');
 assert.equal(typeof minimatch.minimatch,'function');
 const base=await mkdtemp(path.join(os.tmpdir(),'musebench-package-test-')),source=path.join(base,'app'),archive=path.join(base,'app.asar');
 try{
  await mkdir(path.join(source,'native'),{recursive:true});await mkdir(path.join(source,'.config'));
  await writeFile(path.join(source,'main.cjs'),'module.exports = 1;');
  await writeFile(path.join(source,'native','fixture.node'),'fictional-native-module');
  await writeFile(path.join(source,'.config','settings.json'),'{}');
  await asar.createPackageWithOptions(source,archive,{unpack:'**/*.node',dot:true});
  const files=asar.listPackage(archive).map(value=>value.replaceAll('\\','/'));
  assert(files.some(value=>value.endsWith('/main.cjs')));assert(files.some(value=>value.endsWith('/.config/settings.json')));
  assert.equal(asar.extractFile(archive,'main.cjs').toString(),'module.exports = 1;');
  assert.equal(await readFile(path.join(archive+'.unpacked','native','fixture.node'),'utf8'),'fictional-native-module');
  const {FileList}=require('filelist');const list=new FileList(path.join(source,'**','*'),{dot:true});assert(list.toArray().some(value=>value.endsWith('main.cjs')));
  // Squirrel's legacy temp/rimraf consumer still needs callback-style glob.
  // Preserve that public API while its matcher resolves to the patched release.
  const temp=createRequire(require.resolve('electron-winstaller'))('temp');
  temp.track();const temporary=await new Promise((resolve,reject)=>temp.mkdir('musebench-package-fixture-',(error,value)=>error?reject(error):resolve(value)));
  await writeFile(path.join(temporary,'file.txt'),'fixture');
  await new Promise((resolve,reject)=>temp.cleanup((error)=>error?reject(error):resolve()));
  await assert.rejects(readFile(path.join(temporary,'file.txt')),{code:'ENOENT'});
 }finally{asar.uncacheAll?.();await rm(base,{recursive:true,force:true});}
});
