import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const api=await import('../electron/workspace-mcp-config.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const appRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url))),electron=createRequire(import.meta.url)('electron');
async function fixture(t){const root=await mkdtemp(path.join(tmpdir(),'muse-mcp-config-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('trusted factory fixes executable script environment framing and workspace',async t=>{
 assert.equal(typeof api.createWorkspaceMcpConfig,'function');const root=await fixture(t),factory=api.createWorkspaceMcpConfig({appRoot,executable:electron});
 const entry=await factory(root);assert.deepEqual(entry,{transport:'stdio',command:await realpath(electron),args:[path.join(await realpath(appRoot),'src','runtime','workspace-mcp.mjs'),'--root',await realpath(root)],env:{ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''},framing:'lineDelimitedJson',mode:'required'});
 assert.equal(Object.isFrozen(entry),true);assert.equal(Object.isFrozen(entry.args),true);assert.equal(Object.isFrozen(entry.env),true);
});
test('invalid and noncanonical paths cannot become launch configuration',async t=>{
 assert.equal(typeof api.createWorkspaceMcpConfig,'function');const root=await fixture(t);
 for(const value of [null,'relative','',path.join(root,'absent')])await assert.rejects(async()=>api.createWorkspaceMcpConfig({appRoot,executable:electron})(value));
 for(const value of ['relative',root,path.join(root,'absent.exe')])await assert.rejects(async()=>api.createWorkspaceMcpConfig({appRoot,executable:value})(root));
 for(const value of ['relative',electron,path.join(root,'absent')])await assert.rejects(async()=>api.createWorkspaceMcpConfig({appRoot:value,executable:electron})(root));
 const linked=path.join(root,'linked');await symlink(appRoot,linked,process.platform==='win32'?'junction':'dir');await assert.rejects(api.createWorkspaceMcpConfig({appRoot,executable:electron})(linked),/canonical/);
 await assert.rejects(api.createWorkspaceMcpConfig({appRoot:linked,executable:electron})(root),/canonical/);
});
test('script substitution through a junction is rejected',async t=>{
 assert.equal(typeof api.createWorkspaceMcpConfig,'function');const root=await fixture(t),fake=path.join(root,'fake');await mkdir(path.join(fake,'src'),{recursive:true});
 await symlink(path.join(appRoot,'src','runtime'),path.join(fake,'src','runtime'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(api.createWorkspaceMcpConfig({appRoot:fake,executable:electron})(root),/canonical/);
});
test('actual Electron Node-mode child runs semantic worker without desktop and closes cleanly',{timeout:15000},async t=>{
 let child,closed;t.after(async()=>{if(child&&child.exitCode===null){child.kill();await closed;}});
 assert.equal(typeof api.createWorkspaceMcpConfig,'function');const root=await fixture(t);await writeFile(path.join(root,'lib.ts'),'export const value = 7;\n');await writeFile(path.join(root,'main.ts'),"import {value} from './lib';\nvalue;\n");
 const entry=await api.createWorkspaceMcpConfig({appRoot,executable:electron})(root);
 child=spawn(entry.command,entry.args,{env:{...process.env,...entry.env},cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='';const waiters=new Map();
 closed=new Promise(resolve=>child.once('close',resolve));child.stderr.on('data',x=>stderr+=x);child.stdout.on('data',chunk=>{stdout+=chunk;for(let i;(i=stdout.indexOf('\n'))>=0;){const row=JSON.parse(stdout.slice(0,i));stdout=stdout.slice(i+1);waiters.get(row.id)?.(row);}});
 const request=(id,method,params)=>{const result=new Promise(resolve=>waiters.set(id,resolve));child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return result;};
 const initialized=await request(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(initialized.result.serverInfo.name,'musebench-workspace');
 const listing=await request(2,'tools/list',{_meta:{progressToken:'electron-list'}});assert.equal(listing.error,undefined);assert.equal(listing.result.tools.length,2);
 const result=await request(3,'tools/call',{name:'workspace_tool_call',arguments:{operation:'definition',path:'main.ts',line:2,column:2},_meta:{callId:'call_electron_fixture',idempotencyKey:'electron-fixture'}});assert.equal(result.error,undefined);assert.equal(result.result.isError,undefined);assert.deepEqual(JSON.parse(result.result.content[0].text).items.map(row=>row.path),['lib.ts']);
 child.stdin.end();assert.equal(await closed,0);assert.equal(stderr,'');
});
