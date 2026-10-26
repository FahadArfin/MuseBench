import test from 'node:test';
import assert from 'node:assert/strict';

const adapter = await import('../electron/personal-presentation.mjs').catch(() => ({}));

test('presentation adapter never executes in authentication or unrelated documents', async () => {
  assert.equal(typeof adapter.applyPersonalPresentation, 'function');
  for (const url of ['https://auth.muse.ai/', 'https://auth.meta.ai/', 'https://www.facebook.com/', 'https://muse.ai.evil.example/', 'file:///test.html', 'https://name:secret@muse.ai/']) {
    const contents = { isDestroyed: () => false, getURL: () => url, executeJavaScript() { assert.fail('must not inspect this document'); }, insertCSS() { assert.fail('must not style this document'); } };
    assert.equal(await adapter.applyPersonalPresentation(contents, true), false, url);
    assert.equal(await adapter.runPersonalAction(contents, 'whatsapp'), false, url);
  }
});

test('page actions accept only the finite navigation contract', async () => {
  assert.equal(typeof adapter.runPersonalAction, 'function');
  const contents = { isDestroyed: () => false, getURL: () => 'https://muse.ai/', executeJavaScript() { assert.fail('unknown action must not execute'); } };
  for (const action of ['sendMessage', 'logout', 'grant', 'whatsapp;alert(1)', null, {}]) assert.equal(await adapter.runPersonalAction(contents, action), false);
});

test('destroyed contents do not access native getters', async () => {
  assert.equal(typeof adapter.applyPersonalPresentation, 'function');
  const contents = { isDestroyed: () => true, getURL() { assert.fail('destroyed native getter'); } };
  assert.equal(await adapter.applyPersonalPresentation(contents, true), false);
  assert.equal(await adapter.runPersonalAction(contents, 'settings'), false);
});

test('rapid appearance changes and original-layout restoration leave no stale stylesheet', async () => {
  const sheets = new Map(); let sequence=0, release;
  const ready = new Promise(resolve=>{release=resolve;});
  const contents={isDestroyed:()=>false,getURL:()=>'https://muse.ai/',
    async insertCSS(css,options){await ready;assert.equal(options.cssOrigin,'author');const key=String(++sequence);sheets.set(key,css);return key;},
    async removeInsertedCSS(key){sheets.delete(key);},
  };
  const dark=adapter.applyPersonalPresentation(contents,true,{theme:'dark'});
  const light=adapter.applyPersonalPresentation(contents,true,{theme:'light',textSize:'large'});
  const original=adapter.applyPersonalPresentation(contents,false);
  release(); await Promise.all([dark,light,original]); assert.equal(sheets.size,0);
  await adapter.applyPersonalPresentation(contents,true,{theme:'light',textSize:'large'});
  assert.equal(sheets.size,1); assert.match([...sheets.values()][0],/--mb-chat-bg:#faf9f7/);
});
