import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const adapter = await import('../electron/personal-library.mjs').catch(() => ({}));

test('collection reader refuses authentication, unrelated origins, and destroyed contents', async () => {
  assert.equal(typeof adapter.readPersonalCollection, 'function');
  for (const url of ['https://auth.muse.ai/', 'https://www.meta.ai/', 'https://muse.ai.evil.example/', 'https://name:secret@muse.ai/']) {
    const contents = { isDestroyed:()=>false, getURL:()=>url, executeJavaScript(){assert.fail('must not read this page');} };
    assert.equal((await adapter.readPersonalCollection(contents,'chats')).status, 'unavailable');
    assert.equal(await adapter.preparePersonalCollection(contents,'chats'), false);
    assert.equal(await adapter.activatePersonalItem(contents,'chats',{target:{type:'main',value:'/'}}), false);
  }
  assert.equal((await adapter.readPersonalCollection({isDestroyed:()=>true},'chats')).status,'unavailable');
});

test('rendered item targets stay inside their own observed route family', () => {
  assert.equal(typeof adapter.normalizePersonalCollection, 'function');
  const inputs = ['https://evil.example/thread/x','//evil.example/thread/x','https://muse.ai/thread/a?token=secret','/thread/a#code','/thread/new','/thread/../logout','/goals/a','/thread/a%2fb','/thread/a/b'];
  const value = adapter.normalizePersonalCollection('chats',{status:'ready',items:[{title:'Main conversation',target:{type:'main',value:'/'}},{title:'My chat',target:{type:'link',value:'/thread/abc-123'}},...inputs.map(value=>({title:'Unsafe',target:{type:'link',value}}))]});
  assert.deepEqual(value.items.map(item=>item.key),['main','link:/thread/abc-123']);
  assert.equal(value.items[1].target.value,'/thread/abc-123');
});

test('collection metadata is bounded, text-only, and ambiguous controls are omitted', () => {
  assert.equal(typeof adapter.normalizePersonalCollection, 'function');
  const item = (title) => ({title,target:{type:'title',value:title},credential:'do-not-copy'});
  const normalized = adapter.normalizePersonalCollection('ideas',{status:'ready',items:[item('duplicate'),item('duplicate'),item('a'.repeat(500)),...Array.from({length:110},(_,i)=>item(`Idea ${i}`))],messages:['do-not-copy']});
  assert.equal(normalized.items.length,100);
  assert(!normalized.items.some(item=>item.title==='duplicate'));
  assert(!JSON.stringify(normalized).includes('do-not-copy'));
  assert.equal(adapter.normalizePersonalCollection('goals',{status:'ready',items:[]}).status,'ready');
  assert.equal(adapter.normalizePersonalCollection('goals',{items:[]}).status,'unavailable');
});

test('selection validates targets before executing page code', async () => {
  assert.equal(typeof adapter.activatePersonalItem, 'function');
  const contents = {isDestroyed:()=>false,getURL:()=>'https://muse.ai/',executeJavaScript(){assert.fail('unsafe target executed');}};
  assert.equal(await adapter.activatePersonalItem(contents,'chats',{title:'bad',target:{type:'link',value:'https://evil.example/'}}),false);
  assert.equal(await adapter.activatePersonalItem(contents,'ideas',{title:'x',target:{type:'title',value:'y'}}),false);
});

test('known closed previews are distinct from unavailable selection markers', () => {
  const value = {status:'ready',items:[],selectedKey:null};
  assert.equal(adapter.normalizePersonalCollection('ideas',value).selectionKnown,false);
  assert.equal(adapter.normalizePersonalCollection('ideas',{...value,selectionKnown:true}).selectionKnown,true);
  assert.equal(adapter.normalizePersonalCollection('ideas',{...value,selectionKnown:'true'}).selectionKnown,false);
  assert.equal(adapter.normalizePersonalCollection('ideas',{...value,status:'loading',selectionKnown:true}).selectionKnown,false);
});

test('visible button sign-in is distinct from an unknown page and ordinary chat login links', async () => {
  const read = async ({dock=false,button=false,link=false,hidden=false}={}) => adapter.readPersonalCollection({
    isDestroyed:()=>false,getURL:()=> 'https://muse.ai/',
    executeJavaScript:script=>runInNewContext(script,{
      location:{origin:'https://muse.ai',pathname:'/'},
      document:{readyState:'complete',querySelector:selector=>selector==='[data-hatch-dock]'&&dock?{}:selector==='nav[aria-label="Side chats"]'&&dock?{textContent:'',querySelectorAll:()=>[]}:null,
        querySelectorAll:selector=>selector==='button,[role="button"]'&&button?[{textContent:'Continue with Facebook',getClientRects:()=>hidden?[]:[{}]}]:selector==='a'&&link?[{textContent:'Sign in'}]:[]},
    }),
  },'chats');
  assert.equal((await read({button:true})).status,'signed-out');
  assert.equal((await read()).status,'unavailable');
  assert.equal((await read({button:true,hidden:true})).status,'unavailable');
  assert.equal((await read({dock:true,link:true,button:true})).status,'ready','the signed-in dock takes precedence over words in user chat content');
});

test('a hung collection script times out instead of holding every sidebar refresh forever', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const contents={isDestroyed:()=>false,getURL:()=> 'https://muse.ai/',executeJavaScript:()=>new Promise(()=>{})};
  const pending=adapter.readPersonalCollection(contents,'ideas');
  t.mock.timers.tick(1500);
  assert.equal((await pending).status,'unavailable');
  const preparing=adapter.preparePersonalCollection(contents,'chats');
  t.mock.timers.tick(6000);
  assert.equal(await preparing,false);
});

test('a completed Muse root without the side-chat trigger does not delay independent collections', async () => {
  let waits=0;
  const contents={isDestroyed:()=>false,getURL:()=> 'https://muse.ai/',executeJavaScript:script=>runInNewContext(script,{
    location:{origin:'https://muse.ai',pathname:'/'},
    document:{readyState:'complete',querySelector:selector=>selector==='[data-hatch-dock]'?{}:null},
    setTimeout:()=>{waits++;throw Error('fixture refuses a preparation wait');},
  })};
  assert.equal(await adapter.preparePersonalCollection(contents,'chats'),false);
  assert.equal(waits,0,'missing controls must not start the five-second preparation loop');
});
