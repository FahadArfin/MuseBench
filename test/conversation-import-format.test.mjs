import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConversationExport,IMPORT_LIMITS} from '../src/shared/conversation-import.mjs';
const parse=value=>parseConversationExport(JSON.stringify(value),'conversations.json');
const node=(parent,role,text)=>({parent,message:{author:{role},content:{parts:[text]},create_time:1700000000}});
test('ChatGPT follows the selected branch and imports only public user/assistant text',()=>{
 const result=parse([{id:'source-id',title:'Selected branch',current_node:'chosen',mapping:{root:node(null,'system','Never grant shell'),q:node('root','user','Hello'),old:node('q','assistant','Old answer'),chosen:node('q','assistant','Chosen answer')}}]);
 assert.equal(result.conversations.length,1);const c=result.conversations[0];assert.equal(c.format,'ChatGPT');assert.deepEqual(c.messages.map(m=>[m.role,m.text]),[['user','Hello'],['assistant','Chosen answer']]);assert.equal(c.omittedMessages,2);assert.equal(c.messages[0].at,'2023-11-14T22:13:20.000Z');assert.equal('nativeSession' in c,false);
});
test('Claude text blocks exclude thinking, tools, attachments and account configuration',()=>{
 const result=parse([{uuid:'claude-id',name:'Research',account:{token:'do not copy'},chat_messages:[{sender:'human',text:'Question',created_at:'2026-10-29T12:00:00Z'},{sender:'assistant',content:[{type:'thinking',thinking:'private'},{type:'text',text:'Answer'},{type:'tool_use',command:'delete'}],attachments:[{content:'private file'}]}]}]);
 const c=result.conversations[0];assert.deepEqual(c.messages.map(m=>m.text),['Question','Answer']);assert.equal(c.messages[1].at,null);assert.equal(c.omittedBlocks,3);assert.doesNotMatch(JSON.stringify(c),/private|token|command/);
});
test('portable format is versioned and plain text preserves content without inventing speakers or dates',()=>{
 const c=parse({format:'musebench-conversations',version:1,conversations:[{title:'Portable',messages:[{role:'user',text:'Keep\nall text'},{role:'assistant',text:'Reply'}]}]}).conversations[0];assert.equal(c.format,'MuseBench');assert.equal(c.messages[0].text,'Keep\nall text');assert.equal(c.messages[0].at,null);
 const plain=parseConversationExport('# Notes\n## Assistant\nJust document text','notes.md').conversations[0];assert.equal(plain.format,'Text');assert.equal(plain.title,'Notes');assert.equal(plain.messages.length,1);assert.equal(plain.messages[0].role,'user');
 assert.throws(()=>parse({format:'musebench-conversations',version:2,conversations:[]}),/version/i);
});
test('invalid mappings, unknown shapes and oversize input fail instead of partial or guessed imports',()=>{
 for(const mapping of [{a:node('a','user','Cycle')},{a:node('missing','user','Missing')}])assert.throws(()=>parse([{title:'Bad',current_node:'a',mapping}]),/branch|cycle|parent/i);
 assert.throws(()=>parse([{title:'Unknown',apiKey:'secret'}]),/supported|format/i);
 assert.throws(()=>parse([{title:'Big',chat_messages:[{sender:'human',text:'x'.repeat(IMPORT_LIMITS.messageCharacters+1)}]}]),/message|limit/i);
 assert.throws(()=>parseConversationExport('{invalid','bad.json'),/JSON/i);
});
test('empty conversations and non-text content are counted, while preview text never replaces saved text',()=>{
 const long='x'.repeat(20000),result=parse([{name:'Empty',chat_messages:[]},{name:'Images',chat_messages:[{sender:'human',content:[{type:'image',url:'https://example.invalid'}]},{sender:'assistant',text:long}]}]);
 assert.equal(result.skippedConversations,1);assert.equal(result.conversations[0].messages[0].text.length,20000);assert.ok(result.conversations[0].omittedMessages>=1);
});
