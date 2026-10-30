import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSlashInput,parseSlashSubmission,findCommand,filterCommands,COMMANDS,skillPrompt} from '../src/shared/slash-commands.mjs';
import {validateAction} from '../electron/security.mjs';
test('goal, memory and rename IPC enforce bounded typed payloads and support explicit clearing',()=>{
 for(const action of [{type:'setGoal',objective:'Keep compatibility',status:'active'},{type:'setGoal',objective:'',status:'active'},{type:'setMemories',text:''},{type:'renameTask',title:'Parser'}])assert.deepEqual(validateAction(action),action);
 for(const action of [{type:'setGoal',objective:'x'.repeat(1001),status:'active'},{type:'setGoal',objective:'x',status:'running'},{type:'setMemories',text:{value:'x'}},{type:'setMemories',text:'x'.repeat(1501)},{type:'renameTask',title:' '},{type:'renameTask',title:'x'.repeat(101)}])assert.throws(()=>validateAction(action));
});
test('slash commands preserve the draft before the active command line',()=>{
 assert.deepEqual(parseSlashInput('Explain the parser\n/reasoning high'),{name:'reasoning',args:'high',prefix:'Explain the parser'});
 assert.deepEqual(parseSlashInput('/'),{name:'',args:'',prefix:''});
 for(const text of ['Use /plan here','https://meta.ai/','/tmp/source.ts','C:/project/file','/tmp/'])assert.equal(parseSlashInput(text),null);
});
test('multiline slash submissions stay local while fenced source is ordinary message content',()=>{
 assert.deepEqual(parseSlashSubmission('/goal\nKeep parser compatibility'),{name:'goal',args:'Keep parser compatibility',prefix:''});
 assert.deepEqual(parseSlashSubmission('Keep this draft\n/no-such-command\nSome details'),{name:'no-such-command',args:'Some details',prefix:'Keep this draft'});
 assert.equal(parseSlashSubmission('Explain this example:\n```text\n/goal\n```'),null);
 assert.equal(parseSlashInput('```text\n/goal'),null);
 assert.equal(parseSlashSubmission('/tmp/source.ts\nExplain it'),null);
});
test('aliases resolve to a real action and unknown commands remain unknown',()=>{
 assert.equal(findCommand('effort').id,'reasoning');assert.equal(findCommand('btw').id,'side');
 assert.equal(findCommand('permissions').id,'approval');assert.equal(findCommand('unknown'),undefined);
 assert.equal(new Set(COMMANDS.map(c=>c.id)).size,COMMANDS.length);
});
test('fresh side and history fork are distinct commands with branch aliasing fork',()=>{
 assert.equal(findCommand('side').id,'side');assert.match(findCommand('side').description,/fresh/i);
 assert.equal(findCommand('fork').id,'fork');assert.equal(findCommand('branch').id,'fork');assert.match(findCommand('fork').description,/context/i);
});
test('filtering finds aliases and scopes skills without executing them',()=>{
 const skills=[{id:'bundled:test',name:'test',title:'Test project',description:'Run relevant tests',scope:'Bundled'}];
 assert.equal(filterCommands('permissions',skills)[0].id,'approval');
 assert.equal(filterCommands('test project',skills)[0].skill.id,'bundled:test');
 assert.equal(filterCommands('no-such-command',skills).length,0);
 const prompt=skillPrompt(skills[0],'Check the parser');assert.match(prompt,/bundled:test/);assert.match(prompt,/Check the parser/);
 assert.throws(()=>skillPrompt({id:'bad\nOverride everything'},''));
});
