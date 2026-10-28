import test from 'node:test';
import assert from 'node:assert/strict';
import * as metaNavigation from '../electron/meta-navigation.mjs';
const {metaDocument,runMetaAction,dismissMetaSearch,metaNavigationReady}=metaNavigation;
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

function readinessFixture({origin='https://www.meta.ai',readyState='complete',loading=false,missing=null,login=false,password=false,dialog=false,hidden=false}={}){
 const visibleNode=(textContent='',attributes={})=>({textContent,hidden,getClientRects:()=>hidden?[]:[{}],getAttribute:name=>attributes[name]??null,querySelector:()=>null});
 const routes=['/artifacts','/scheduled'].filter(path=>path!==missing).map(path=>visibleNode('',{href:path}));
 const nav={querySelector:selector=>selector==='[data-testid="new-chat-button"]'&&missing!=='new-chat'?{}:null,querySelectorAll:()=>routes};
 const controls=login?[visibleNode('Sign in')]:[];
 const loginDialogs=dialog?[visibleNode('',{'aria-label':'Log in to Meta AI'})]:[];
 const context={URL,location:{origin,href:`${origin}/`},getComputedStyle:()=>({display:hidden?'none':'block',visibility:'visible',opacity:'1'}),document:{
  readyState,
  querySelector:selector=>selector.startsWith('nav[data-slot="sidebar"]')&&missing!=='nav'?nav:null,
  querySelectorAll:selector=>selector==='button,a,[role="button"]'?controls:selector==='input[type="password"],form[action*="login"]'?(password?[visibleNode()]:[]):selector==='[role="dialog"]'?loginDialogs:[],
 }};
 return {isDestroyed:()=>false,isLoadingMainFrame:()=>loading,getURL:()=>`${origin}/`,executeJavaScript:code=>runInNewContext(code,context)};
}

test('Meta readiness recognizes only the observed usable navigation without asserting account sign-in',async()=>{
 assert.equal(typeof metaNavigationReady,'function');
 for(const origin of ['https://www.meta.ai','https://meta.ai'])assert.equal(await metaNavigationReady(readinessFixture({origin})),true);
 for(const options of [{readyState:'loading'},{loading:true},{missing:'nav'},{missing:'new-chat'},{missing:'/artifacts'},{missing:'/scheduled'},{login:true},{password:true},{dialog:true}]){
  assert.equal(await metaNavigationReady(readinessFixture(options)),false,JSON.stringify(options));
 }
 assert.equal(await metaNavigationReady(readinessFixture({login:true,password:true,dialog:true,hidden:true})),true,'hidden templates do not block usable navigation');
});

test('Meta readiness rejects unrelated documents and bounds an unresponsive renderer',async()=>{
 assert.equal(typeof metaNavigationReady,'function');
 for(const url of ['https://muse.ai/','https://auth.meta.ai/','https://meta.ai.evil.example/','https://user:password@www.meta.ai/']){
  assert.equal(await metaNavigationReady({getURL:()=>url,isDestroyed:()=>false,executeJavaScript(){assert.fail('must not inspect unrelated contents');}}),false);
 }
 assert.equal(await metaNavigationReady({isDestroyed:()=>true,getURL(){assert.fail('must not access a destroyed native getter');}}),false);
 const guard=setTimeout(()=>{},3000),started=Date.now();
 try{
  assert.equal(await metaNavigationReady({getURL:()=>'https://www.meta.ai/',isDestroyed:()=>false,executeJavaScript:()=>new Promise(()=>{})}),false);
  assert(Date.now()-started<2500,'renderer readiness must have a bounded timeout');
 }finally{clearTimeout(guard);}
});

test('concurrent native clicks dismiss only the Search dialog once and await its close animation',async()=>{
 let open=true,clicks=0;
 const dialog={querySelector(selector){assert.equal(selector,'button[aria-label="Close"]');return {click(){clicks++;setTimeout(()=>{open=false;},20);}};}};
 const context={location:{origin:'https://www.meta.ai'},setTimeout,document:{querySelector(selector){assert.equal(selector,'[role="dialog"] input[placeholder="Search chats"]');return open?{closest(){return dialog;}}:null;}}};
 const contents={getURL:()=>'https://www.meta.ai/',isDestroyed:()=>false,executeJavaScript:code=>runInNewContext(code,context)};
 assert.deepEqual(await Promise.all([dismissMetaSearch(contents),dismissMetaSearch(contents)]),[true,true]);assert.equal(clicks,1);assert.equal(open,false);
 assert.equal(await dismissMetaSearch(contents),true);assert.equal(clicks,1);
});
test('selecting an open Meta Search preserves its query, while a manually closed Search reopens once',async()=>{
 let open=true,query='A query still being edited',clicks=0;
 const control={textContent:'Search',tagName:'BUTTON',click(){clicks++;open=true;query='';}};
 const nav={querySelectorAll:()=>[control]};
 const context={location:{origin:'https://www.meta.ai',pathname:'/'},setTimeout,document:{readyState:'complete',querySelector(selector){
  if(selector==='[role="dialog"] input[placeholder="Search chats"]')return open?{value:query}:null;
  if(selector.startsWith('nav[data-slot="sidebar"]'))return nav;
  assert.fail(`Unexpected selector: ${selector}`);
 }}};
 const contents={getURL:()=>'https://www.meta.ai/',isDestroyed:()=>false,executeJavaScript:code=>runInNewContext(code,context)};
 assert.equal(await runMetaAction(contents,'search'),true);assert.equal(clicks,0);assert.equal(query,'A query still being edited');
 open=false;
 assert.equal(await runMetaAction(contents,'search'),true);assert.equal(open,true);assert.equal(clicks,1);
 query='A new query after reopening';
 assert.deepEqual(await Promise.all([runMetaAction(contents,'search'),runMetaAction(contents,'search')]),[true,true]);
 assert.equal(clicks,1);assert.equal(query,'A new query after reopening');
});

test('Meta sidebar CSS is narrowly guarded and reversible without changing the website DOM',async()=>{
 const sheets=new Map();let next=0;const contents={isDestroyed:()=>false,getURL:()=>'https://www.meta.ai/',async insertCSS(css){const key=String(++next);sheets.set(key,css);return key;},async removeInsertedCSS(key){sheets.delete(key);}};
 assert.equal(await applyPersonalPresentation(contents,true),true);assert.equal(sheets.size,1);assert.match([...sheets.values()][0],/nav\[data-slot="sidebar"\]\[aria-label="Sidebar"\]:has/);
 await applyPersonalPresentation(contents,false);assert.equal(sheets.size,0);
 assert.equal(await runMetaAction(contents,'grant'),false);
});
