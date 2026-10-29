import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkConfiguration} from '../src/runtime/exec.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';

const entry={transport:'stdio',command:'node',args:['reviewed-server.mjs'],enabled:true,mode:'optional'};
async function fixture(t,platform){
 const root=await mkdtemp(path.join(tmpdir(),'musebench-config-review-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const profile=path.join(root,'home'),workspaceRoot=path.join(root,'project'),config=path.join(profile,'.config','muse'),data=path.join(profile,'.local','share','muse');
 await mkdir(config,{recursive:true});await mkdir(workspaceRoot);
 const environment=platform==='win32'?{USERPROFILE:profile}:{HOME:profile};
 const extensionReview=await createExtensionReview({dataDir:path.join(root,'app'),profile,platform});
 const check=()=>checkConfiguration({environment,platform,workspaceRoot,extensionReview});
 return{root,profile,config,data,environment,workspaceRoot,extensionReview,check};
}

for(const platform of ['win32','linux','darwin']){
 test(`${platform}: reviewed MCP runs, changed definitions and saved native trust fail`,async t=>{
  const f=await fixture(t,platform),settings=path.join(f.config,'settings.json');
  await writeFile(settings,JSON.stringify({mcp_servers:{docs:entry}}));
  await assert.rejects(f.check(),/review/i);
  await f.extensionReview.approveMcp('docs',entry);await f.check();
  await writeFile(settings,JSON.stringify({mcp_servers:{docs:{...entry,args:['changed.mjs']}}}));
  await assert.rejects(f.check(),/review/i);
  await writeFile(settings,'{}');await writeFile(path.join(f.config,'trust.json'),'{}');
  await assert.rejects(f.check(),/saved workspace trust/);
 });
 test(`${platform}: explicit XDG settings and plugin stores cannot bypass review`,async t=>{
  const f=await fixture(t,platform),xdg=path.join(f.root,'xdg-config'),store=path.join(f.root,'xdg-data');
  f.environment.XDG_CONFIG_HOME=xdg;f.environment.XDG_DATA_HOME=store;
  await mkdir(path.join(xdg,'muse'),{recursive:true});
  await writeFile(path.join(xdg,'muse','settings.json'),JSON.stringify({mcp_servers:{docs:entry}}));
  await assert.rejects(f.check(),/review|MCP/i);
  await f.extensionReview.approveMcp('docs',entry);await f.check();
  await mkdir(path.join(store,'muse','plugins'),{recursive:true});
  await writeFile(path.join(store,'muse','plugins','installed.json'),'{}');
  await assert.rejects(f.check(),/plugin inventory/);
 });
 test(`${platform}: ancestor project settings are checked`,async t=>{
  const f=await fixture(t,platform);await writeFile(path.join(f.root,'.mcp.json'),'{}');
  await assert.rejects(f.check(),/project MCP configuration/);
 });
}

test('invalid configuration roots and settings shapes fail with value-free errors',async t=>{
 const f=await fixture(t,'linux'),settings=path.join(f.config,'settings.json');
 for(const key of ['XDG_CONFIG_HOME','XDG_DATA_HOME']){
  f.environment[key]='relative-private-root';await assert.rejects(f.check(),error=>/absolute/i.test(error.message)&&!error.message.includes('relative-private-root'));delete f.environment[key];
 }
 for(const source of ['null','[]','"private-settings-value"','{"mcp_servers":["private-settings-value"]}','{','{"mcp_servers":7}']){
  await writeFile(settings,source);await assert.rejects(f.check(),error=>/settings|configuration/i.test(error.message)&&!error.message.includes('private-settings-value'));
 }
 await writeFile(settings,' '.repeat(1024*1024+1));await assert.rejects(f.check(),/settings/i);
});
