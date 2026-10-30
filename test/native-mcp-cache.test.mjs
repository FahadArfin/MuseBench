import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,symlink,link,lstat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareNativeMcpConfig} from '../electron/native-mcp-cache.mjs';

async function fixture(t){
 const base=await mkdtemp(path.join(os.tmpdir(),'muse-mcp-cache-')),install=path.join(base,'installed app'),dataDir=path.join(base,'private profile'),appRoot=path.join(install,'resources','app');
 await mkdir(path.join(appRoot,'dist'),{recursive:true});await mkdir(dataDir);await writeFile(path.join(install,'MuseBench.exe'),'trusted executable');await writeFile(path.join(install,'icudtl.dat'),'trusted ICU');await writeFile(path.join(install,'LICENSE.electron.txt'),'Electron license');await writeFile(path.join(install,'LICENSES.chromium.html'),'Chromium notices');await writeFile(path.join(appRoot,'dist','native-mcp.mjs'),'trusted standalone relay');
 for(const name of ['snapshot_blob.bin','v8_context_snapshot.bin'])await writeFile(path.join(install,name),'trusted '+name);
 t.after(()=>rm(base,{recursive:true,force:true}));return{base,install,dataDir,appRoot,executable:path.join(install,'MuseBench.exe'),platform:'win32'};
}

test('generated Windows config keeps all runtime inputs outside files being replaced by an update',async t=>{
 const f=await fixture(t),config=await prepareNativeMcpConfig(f);assert.ok(config.command.startsWith(f.dataDir+path.sep));assert.equal(path.basename(config.command),'MuseBenchControl.exe');assert.ok(config.args[0].startsWith(f.dataDir+path.sep));assert.deepEqual(config.args.slice(1),['--data-dir',f.dataDir]);assert.deepEqual(config.env,{ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''});
 assert.equal(await readFile(config.command,'utf8'),'trusted executable');assert.equal(await readFile(path.join(path.dirname(config.command),'icudtl.dat'),'utf8'),'trusted ICU');assert.equal(await readFile(config.args[0],'utf8'),'trusted standalone relay');assert.equal(await readFile(path.join(path.dirname(config.command),'LICENSE.electron.txt'),'utf8'),'Electron license');
 await rm(f.install,{recursive:true});assert.equal(await readFile(config.command,'utf8'),'trusted executable');assert.equal(await readFile(config.args[0],'utf8'),'trusted standalone relay');
});

test('concurrent preparation is immutable and a relay update reuses the same verified runtime',async t=>{
 const f=await fixture(t),configs=await Promise.all(Array.from({length:4},()=>prepareNativeMcpConfig(f)));for(const config of configs)assert.deepEqual(config,configs[0]);
 await writeFile(path.join(f.appRoot,'dist','native-mcp.mjs'),'new standalone relay');const next=await prepareNativeMcpConfig(f);assert.equal(next.command,configs[0].command);assert.notEqual(next.args[0],configs[0].args[0]);assert.equal(await readFile(configs[0].args[0],'utf8'),'trusted standalone relay');assert.equal(await readFile(next.args[0],'utf8'),'new standalone relay');assert.ok(!(await readdir(path.dirname(next.command))).some(name=>name.endsWith('.tmp')));
});

test('corrupted or linked cache files are refused without replacing their contents',async t=>{
 const f=await fixture(t),config=await prepareNativeMcpConfig(f);await writeFile(config.command,'corrupted cache');await assert.rejects(prepareNativeMcpConfig(f),/cache.*changed|integrity/i);assert.equal(await readFile(config.command,'utf8'),'corrupted cache');
 const linked=await fixture(t),outside=path.join(linked.base,'outside');await mkdir(outside);await symlink(outside,path.join(linked.dataDir,'native-control'),process.platform==='win32'?'junction':'dir');await assert.rejects(prepareNativeMcpConfig(linked),/link|directory|path/i);assert.deepEqual(await readdir(outside),[]);
});

test('a cache inside the installation cannot be advertised as update safe',async t=>{
 const f=await fixture(t);await mkdir(path.join(f.install,'profile'));await assert.rejects(prepareNativeMcpConfig({...f,dataDir:path.join(f.install,'profile')}),/outside|installation/i);
 const config=await prepareNativeMcpConfig({...f,platform:'linux'});assert.equal(config.command,f.executable);assert.equal(config.args[0],path.join(f.appRoot,'electron','native-mcp-server.mjs'));
});

for(const kind of ['runtime','bridge'])test('a hard-linked '+kind+' is refused even when its current bytes match',async t=>{
 const f=await fixture(t),config=await prepareNativeMcpConfig(f),target=kind==='runtime'?config.command:config.args[0],outside=path.join(f.base,'external-'+kind);
 await copyFile(target,outside);await rm(target);await link(outside,target);assert.equal((await lstat(target)).nlink,2);
 await assert.rejects(prepareNativeMcpConfig(f),/link/i);
 assert.equal((await lstat(target)).nlink,2,'Refusing a linked cache must not modify external files');assert.deepEqual(await readFile(target),await readFile(outside));
});

test('an unlinked Windows directory alias uses its canonical location without rejecting the profile',{skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t),control=path.join(f.dataDir,'NATIVE-CONTROL');await mkdir(control);await writeFile(path.join(control,'connection.json'),'descriptor sentinel');
 const config=await prepareNativeMcpConfig(f);assert.ok(config.command.startsWith(control+path.sep));assert.equal(await readFile(path.join(config.args[2],'native-control','connection.json'),'utf8'),'descriptor sentinel');
 assert.equal((await lstat(control)).isSymbolicLink(),false);
});
