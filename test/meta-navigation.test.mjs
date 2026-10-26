import test from 'node:test';
import assert from 'node:assert/strict';
import {metaDocument,runMetaAction,dismissMetaSearch} from '../electron/meta-navigation.mjs';
import {runInNewContext} from 'node:vm';
import {applyPersonalPresentation} from '../electron/personal-presentation.mjs';
import {validatePersonalCommand} from '../electron/personal-policy.mjs';
test('Meta navigation accepts only the six native shortcuts with no arbitrary URL or script',()=>{
 for(const action of ['newChat','search','media','artifacts','scheduled','vibes'])assert.deepEqual(validatePersonalCommand({type:'metaAction',action}),{type:'metaAction',action});
 for(const action of ['logout','sendMessage','grant','https://example.com',null])assert.throws(()=>validatePersonalCommand({type:'metaAction',action}));
 assert.throws(()=>validatePersonalCommand({type:'metaAction',action:'search',url:'https://example.com'}));
});
test('Meta adapter never runs on auth pages, Muse, lookalike origins or destroyed contents',async()=>{
 for(const url of ['https://muse.ai/','https://auth.meta.ai/','https://www.meta.ai.evil.com/','https://user:password@www.meta.ai/','http://www.meta.ai/']){
  const contents={getURL:()=>url,isDestroyed:()=>false,executeJavaScript(){assert.fail('must not execute');}};assert.equal(metaDocument(contents),false);assert.equal(await runMetaAction(contents,'newChat'),false);assert.equal(await dismissMetaSearch(contents),false);
 }
 assert.equal(metaDocument({isDestroyed:()=>true,getURL(){assert.fail('destroyed getter');}}),false);
});

test('concurrent native clicks dismiss only the Search dialog once and await its close animation',async()=>{
 let open=true,clicks=0;
 const dialog={querySelector(selector){assert.equal(selector,'button[aria-label="Close"]');return {click(){clicks++;setTimeout(()=>{open=false;},20);}};}};
 const context={location:{origin:'https://www.meta.ai'},setTimeout,document:{querySelector(selector){assert.equal(selector,'[role="dialog"] input[placeholder="Search chats"]');return open?{closest(){return dialog;}}:null;}}};
 const contents={getURL:()=>'https://www.meta.ai/',isDestroyed:()=>false,executeJavaScript:code=>runInNewContext(code,context)};
 assert.deepEqual(await Promise.all([dismissMetaSearch(contents),dismissMetaSearch(contents)]),[true,true]);assert.equal(clicks,1);assert.equal(open,false);
 assert.equal(await dismissMetaSearch(contents),true);assert.equal(clicks,1);
});
test('Meta sidebar CSS is narrowly guarded and reversible without changing the website DOM',async()=>{
 const sheets=new Map();let next=0;const contents={isDestroyed:()=>false,getURL:()=>'https://www.meta.ai/',async insertCSS(css){const key=String(++next);sheets.set(key,css);return key;},async removeInsertedCSS(key){sheets.delete(key);}};
 assert.equal(await applyPersonalPresentation(contents,true),true);assert.equal(sheets.size,1);assert.match([...sheets.values()][0],/nav\[data-slot="sidebar"\]\[aria-label="Sidebar"\]:has/);
 await applyPersonalPresentation(contents,false);assert.equal(sheets.size,0);
 assert.equal(await runMetaAction(contents,'grant'),false);
});
