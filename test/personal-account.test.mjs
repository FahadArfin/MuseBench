import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {chromium} from 'playwright';

const adapter = await import('../electron/personal-account.mjs').catch(() => ({}));

test('account normalization exposes only bounded identity text and known statuses', () => {
  assert.equal(typeof adapter.normalizeMetaAccount, 'function');
  assert.deepEqual(adapter.normalizeMetaAccount({status:'ready',handle:'Alex_Morgan',displayName:'  Alex   Morgan  ',email:'private@example.test',avatar:'https://example.test/private'}), {status:'ready',handle:'Alex_Morgan',displayName:'Alex Morgan'});
  assert.deepEqual(adapter.normalizeMetaAccount({status:'ready',handle:'renee',displayName:'Renée 李'}), {status:'ready',handle:'renee',displayName:'Renée 李'});
  for (const handle of ['', '@alex', '../alex', 'Alex Morgan', 'alex\n', 'a'.repeat(101), 42]) {
    assert.deepEqual(adapter.normalizeMetaAccount({status:'ready',handle,displayName:'Alex Morgan'}), {status:'unavailable'});
  }
  for (const displayName of ['x'.repeat(101), 'Alex\u0000Morgan', 'Alex\u202eMorgan', {}, '']) {
    assert.deepEqual(adapter.normalizeMetaAccount({status:'ready',handle:'alex_morgan',displayName}), {status:'ready',handle:'alex_morgan'});
  }
  for (const status of ['signed-out','loading','unavailable']) {
    assert.deepEqual(adapter.normalizeMetaAccount({status,handle:'alex_morgan',displayName:'Alex Morgan'}), {status});
  }
  for (const value of [null,{},'ready',{status:'unexpected'}]) assert.deepEqual(adapter.normalizeMetaAccount(value),{status:'unavailable'});
});

test('account reader rejects unrelated and destroyed documents before page inspection', async () => {
  assert.equal(typeof adapter.readMetaAccount, 'function');
  for (const url of ['https://muse.ai/','https://auth.meta.ai/','https://meta.ai.evil.example/','https://user:secret@www.meta.ai/','http://www.meta.ai/','https://meta.ai:8443/','file:///fixture.html','not a URL']) {
    assert.deepEqual(await adapter.readMetaAccount({isDestroyed:()=>false,getURL:()=>url,executeJavaScript:()=>assert.fail('untrusted document inspected')}),{status:'unavailable'});
  }
  assert.deepEqual(await adapter.readMetaAccount({isDestroyed:()=>true,getURL:()=>assert.fail('destroyed document accessed')}),{status:'unavailable'});
  assert.deepEqual(await adapter.readMetaAccount(null),{status:'unavailable'});
  assert.deepEqual(await adapter.readMetaAccount({isDestroyed:()=>false,getURL(){throw Error('closed');}}),{status:'unavailable'});
  assert.deepEqual(await adapter.readMetaAccount({isDestroyed:()=>false,getURL:()=>'https://www.meta.ai/',isLoadingMainFrame:()=>true,executeJavaScript:()=>assert.fail('loading document inspected')}),{status:'loading'});
});

const sidebar = (handle='alex_morgan', attributes='') => `<nav data-slot="sidebar" aria-label="Sidebar" ${attributes}><div data-testid="user-menu-button" data-slot="dropdown-menu-trigger"><img alt="A"><span>${handle}</span></div></nav>`;
const profile = ({handle='alex_morgan',name='Alex Morgan',edit='<button>Edit profile</button>'}={}) => `<main><section><div><div style="display:flex"><h2>${handle}</h2></div><span>${name}</span></div>${edit}</section></main>`;

test('rendered account reader identifies the official account without reading chat, credentials, avatars, or storage', {timeout:30000}, async t => {
  assert.equal(typeof adapter.readMetaAccount, 'function');
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  let body = '';
  await page.route('**/*', route => route.fulfill({contentType:'text/html',body:`<!doctype html><body>${body}</body>`}));
  const contents = {isDestroyed:()=>false,getURL:()=>page.url(),executeJavaScript:script=>page.evaluate(script)};
  const show = async (html, path='/', origin='https://www.meta.ai') => {
    body=html;
    await page.goto(`${origin}${path}`);
  };

  await t.test('uses the exact official menu, preserving handle case and allowing the app-hidden sidebar', async () => {
    for (const origin of ['https://www.meta.ai','https://meta.ai']) {
      await show(sidebar('Alex_Morgan','style="display:none"'), '/', origin);
      assert.deepEqual(await adapter.readMetaAccount(contents),{status:'ready',handle:'Alex_Morgan'});
    }
  });

  await t.test('chat prose, standalone menu imitations, and malformed or ambiguous account markers cannot identify an account', async () => {
    for (const html of [
      '<main><p>Your account is Alex Morgan (@alex_morgan)</p><button>Edit profile</button><h2>alex_morgan</h2></main>',
      '<div data-testid="user-menu-button" data-slot="dropdown-menu-trigger"><span>alex_morgan</span></div>',
      '<nav aria-label="Sidebar"><div data-testid="user-menu-button" data-slot="dropdown-menu-trigger"><span>alex_morgan</span></div></nav>',
      sidebar('Alex Morgan'),
      sidebar('alex_morgan')+sidebar('other_user'),
      sidebar('alex_morgan<span>other_user</span>'),
      sidebar('alex_morgan').replace('</span>','</span><span>other_user</span>')
    ]) {
      await show(html);
      assert.deepEqual(await adapter.readMetaAccount(contents),{status:'unavailable'});
    }
  });

  await t.test('reads a full name only from a matching own profile with a visible edit control', async () => {
    await show(sidebar()+profile(), '/@alex_morgan');
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'ready',handle:'alex_morgan',displayName:'Alex Morgan'});
    for (const [path, html] of [
      ['/chat/fixture',profile()],
      ['/@other_user',profile({handle:'other_user',name:'Another Person'})],
      ['/@alex_morgan',profile({handle:'other_user',name:'Another Person'})],
      ['/@alex_morgan',profile({edit:''})],
      ['/@alex_morgan',profile({edit:'<button hidden>Edit profile</button>'})],
      ['/@alex_morgan',profile({edit:'<button>Suggest Edit profile</button>'})],
      ['/@alex_morgan',profile().replace('<span>Alex Morgan</span>','<span>Alex Morgan</span><span>Another Person</span>')],
      ['/@alex_morgan',profile()+profile({name:'Another Person'})]
    ]) {
      await show(sidebar()+html,path);
      assert.deepEqual(await adapter.readMetaAccount(contents),{status:'ready',handle:'alex_morgan'});
    }
  });

  await t.test('visible sign-in screens and dialogs are distinct from hidden templates', async () => {
    for (const marker of ['<button>Log in</button>','<a href="/login">Continue with Facebook</a>','<button aria-label="Sign in"></button>','<input type="password">','<div role="dialog" aria-label="Log in to Meta AI">Welcome</div>']) {
      await show(marker);
      assert.deepEqual(await adapter.readMetaAccount(contents),{status:'signed-out'});
    }
    await show(sidebar()+'<div role="dialog" aria-label="Log in to Meta AI">Welcome</div>');
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'signed-out'});
    await show(sidebar().replace('</nav>','<button>Log in</button></nav>'));
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'signed-out'});
    for (const style of ['display:none','visibility:hidden','opacity:0']) {
      await show(sidebar()+`<section style="${style}"><button>Log in</button><input type="password"></section>`);
      assert.deepEqual(await adapter.readMetaAccount(contents),{status:'ready',handle:'alex_morgan'});
    }
  });

  await t.test('ordinary conversation login links cannot sign out a verified account', async () => {
    await show(sidebar()+'<main><p>Open the account page:</p><a href="https://example.test/login">Log in</a><button>Sign in</button></main>');
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'ready',handle:'alex_morgan'});
  });

  await t.test('documents still loading are distinguished from an unknown completed layout', async () => {
    await show('<main>Loading</main>');
    await page.evaluate(() => Object.defineProperty(document,'readyState',{configurable:true,get:()=>'loading'}));
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'loading'});
    await show('<main>Unknown layout</main>');
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'unavailable'});
  });

  await t.test('host URL and rendered location must both be trusted and refer to the same document', async () => {
    await show(sidebar(), '/', 'https://unrelated.example');
    assert.deepEqual(await adapter.readMetaAccount({...contents,getURL:()=>'https://www.meta.ai/'}),{status:'unavailable'});
    await show(sidebar(), '/@alex_morgan');
    assert.deepEqual(await adapter.readMetaAccount({...contents,getURL:()=>'https://www.meta.ai/'}),{status:'unavailable'});
  });

  await t.test('identity reading is passive and never consults credential storage or avatar URLs', async () => {
    await show(sidebar()+profile(), '/@alex_morgan');
    await page.evaluate(() => {
      window.fixtureAccesses=[];
      const forbidden=kind=>()=>{window.fixtureAccesses.push(kind);throw Error(`Forbidden ${kind}`);};
      Object.defineProperty(document,'cookie',{get:forbidden('cookie')});
      for (const key of ['localStorage','sessionStorage']) Object.defineProperty(window,key,{get:forbidden(key)});
      Object.defineProperty(HTMLImageElement.prototype,'src',{get:forbidden('avatar')});
      window.fetch=forbidden('fetch');
      window.XMLHttpRequest=forbidden('XMLHttpRequest');
      document.addEventListener('click',forbidden('click'));
    });
    assert.deepEqual(await adapter.readMetaAccount(contents),{status:'ready',handle:'alex_morgan',displayName:'Alex Morgan'});
    assert.deepEqual(await page.evaluate(() => window.fixtureAccesses),[]);
  });
});

test('account reader discards renderer failures and identity captured across navigation', async () => {
  assert.equal(typeof adapter.readMetaAccount, 'function');
  const account={status:'ready',handle:'alex_morgan',displayName:'Alex Morgan'};
  const base={isDestroyed:()=>false,getURL:()=>'https://www.meta.ai/'};
  assert.deepEqual(await adapter.readMetaAccount({...base,executeJavaScript(){throw Error('renderer gone');}}),{status:'unavailable'});
  assert.deepEqual(await adapter.readMetaAccount({...base,executeJavaScript:async()=>({status:'ready',handle:'../bad'})}),{status:'unavailable'});
  let url='https://www.meta.ai/';
  assert.deepEqual(await adapter.readMetaAccount({...base,getURL:()=>url,executeJavaScript:async()=>{url='https://unrelated.example/';return account;}}),{status:'unavailable'});
  const contents=Object.assign(new EventEmitter(),base,{executeJavaScript:async()=>{contents.emit('did-start-navigation',{},'https://www.meta.ai/',false,true);return account;}});
  assert.deepEqual(await adapter.readMetaAccount(contents),{status:'unavailable'});
  assert.equal(contents.listenerCount('did-start-navigation'),0,'read-scoped observers are removed');
});

test('an unresponsive account renderer has a bounded result and late success cannot replace it', {timeout:4000}, async () => {
  assert.equal(typeof adapter.readMetaAccount, 'function');
  let resolveRenderer;
  const contents={isDestroyed:()=>false,getURL:()=>'https://www.meta.ai/',executeJavaScript:()=>new Promise(resolve=>{resolveRenderer=resolve;})};
  const guard=setTimeout(()=>{},3000),start=Date.now();
  try {
    const result=await adapter.readMetaAccount(contents);
    assert.deepEqual(result,{status:'unavailable'});
    assert(Date.now()-start<2500,'renderer inspection must time out');
    resolveRenderer({status:'ready',handle:'alex_morgan'});
    await Promise.resolve();
    assert.deepEqual(result,{status:'unavailable'});
  } finally {clearTimeout(guard);}
});
