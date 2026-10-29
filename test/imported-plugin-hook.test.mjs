import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {inspectPluginHook} from '../electron/plugin-hook-definition.mjs';
import * as commands from '../electron/plugin-command-review.mjs';

async function fixture(t,{family='claude-compatible',layout='file'}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-import-review-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const cacheRoot=path.join(root,'package');await mkdir(cacheRoot);
 const marker=family==='claude-compatible'?'.claude-plugin/plugin.json':'.codex-plugin/plugin.json';
 const handler={type:'command',command:'node "$CLAUDE_PLUGIN_ROOT/hooks/record.mjs" && echo "done"',timeout:3,async:false,silent:true,description:'Owned fixture',statusMessage:'Recording'};
 const group={matcher:'Bash|Read',hooks:[handler]},events={PreToolUse:[group]},manifest={name:'fixture',version:'1.0.0'};
 const source=layout==='inline'?marker:layout==='explicit'?'custom-hooks.json':'hooks/hooks.json';
 if(layout==='inline')manifest.hooks=events;if(layout==='explicit')manifest.hooks=['./custom-hooks.json'];
 const definition={id:'hook-0123456789abcdef',event:'PreToolUse',matcher:'Bash|Read',command:[handler.command],shell_command:handler.command,source_path:null,source_relative_path:source,timeout_ms:3000,async:false,compatibility_name:null};
 async function save(){for(const [file,doc] of [[marker,manifest],...(layout==='inline'?[]:[[source,{hooks:events}]])]){await mkdir(path.dirname(path.join(cacheRoot,file)),{recursive:true});await writeFile(path.join(cacheRoot,file),JSON.stringify(doc));}}
 await save();const inspect=()=>inspectPluginHook(definition,{cacheRoot,pluginId:'fixture',manifestFamily:family});
 return{root,cacheRoot,marker,source,handler,group,events,manifest,definition,save,inspect};
}

for(const [family,layout] of [['claude-compatible','file'],['claude-compatible','inline'],['codex-compatible','explicit']])test(`${family} ${layout} review keeps the shell, matcher and source visible`,async t=>{
 const f=await fixture(t,{family,layout}),value=await f.inspect();assert.equal(value.supported,true,value.reason);
 assert.deepEqual(value.hook,{event:'PreToolUse',timeoutMs:3000,async:false,matcher:'Bash|Read',compatibilityName:null,execution:'shell',source:f.source,ignoredSilent:true});
 assert.equal(value.source.handler.command,'node "$CLAUDE_PLUGIN_ROOT/hooks/record.mjs" && echo "done"');
});

for(const change of ['condition','hidden handler field','hidden group field','ambiguous handler','event','matcher','shell projection','argv projection','timeout','background','compatibility alias','native source','path escape','absolute source','undeclared file','missing file','wrong manifest name','wrong file shape','unknown event'])test('imported hook cannot approve '+change,async t=>{
 const f=await fixture(t);
 if(change==='condition')f.handler.if='Bash(git *)';
 if(change==='hidden handler field')f.handler.outputCapabilities=['skills.v1'];
 if(change==='hidden group field')f.group.if='something';
 if(change==='ambiguous handler')f.group.hooks.push({...f.handler,description:'different source'});
 if(change==='event')f.definition.event='PostToolUse';
 if(change==='matcher')f.definition.matcher='Write';
 if(change==='shell projection')f.definition.shell_command='echo different';
 if(change==='argv projection')f.definition.command=['echo different'];
 if(change==='timeout')f.definition.timeout_ms=4000;
 if(change==='background')f.definition.async=true;
 if(change==='compatibility alias')f.definition.compatibility_name='Bash';
 if(change==='native source')f.definition.source_path=path.join(f.cacheRoot,f.source);
 if(change==='path escape')f.definition.source_relative_path='../outside.json';
 if(change==='absolute source')f.definition.source_relative_path=path.join(f.cacheRoot,f.source);
 if(change==='undeclared file')f.definition.source_relative_path='other.json';
 if(change==='missing file')f.definition.source_relative_path='missing.json';
 if(change==='wrong manifest name')f.manifest.name='other';
 if(change==='unknown event'){f.events.FutureEvent=f.events.PreToolUse;delete f.events.PreToolUse;f.definition.event='FutureEvent';}
 await f.save();if(change==='wrong file shape')await writeFile(path.join(f.cacheRoot,f.source),JSON.stringify(f.events));
 const value=await f.inspect();assert.equal(value.supported,false);assert.ok(value.reason);
});

test('default timeout, empty matcher and the legacy prompt alias retain native meaning',async t=>{
 const f=await fixture(t);delete f.handler.timeout;delete f.group.matcher;f.events.PreUserTurn=f.events.PreToolUse;delete f.events.PreToolUse;
 Object.assign(f.definition,{event:'UserPromptSubmit',matcher:null,timeout_ms:600000});await f.save();
 const value=await f.inspect();assert.equal(value.supported,true,value.reason);assert.equal(value.hook.timeoutMs,600000);assert.equal(value.hook.matcher,null);assert.equal(value.hook.event,'UserPromptSubmit');
});

test('Codex explicit hooks do not authorize an unselected conventional hook file',async t=>{
 const f=await fixture(t,{family:'codex-compatible'});f.manifest.hooks='./different.json';await f.save();assert.equal((await f.inspect()).supported,false);
});

test('shell review preserves complete syntax and refuses recognized embedded credentials',()=>{
 const safe='node "$CLAUDE_PLUGIN_ROOT/hooks/check.mjs"\nif test "$STATUS" = 0; then echo https://example.com/path; fi';
 assert.equal(commands.displayPluginShellCommand(safe),safe);
 for(const command of ['node check --token fixture-secret','node check --api-key=fixture-secret','TOKEN=fixture-secret node check','curl https://user:password@example.com/','node -e "const apiKey=\'fixture-secret\'"'])assert.throws(()=>commands.displayPluginShellCommand(command),error=>/credential/i.test(error.message)&&!error.message.includes('fixture-secret'));
});
