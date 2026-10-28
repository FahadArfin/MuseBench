import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const adapter = await import('../electron/personal-fonts.mjs').catch(() => ({}));

test('bundled personal fonts never execute on authentication, unrelated or destroyed contents', async () => {
  assert.equal(typeof adapter.applyPersonalFonts, 'function');
  for (const url of ['https://auth.muse.ai/', 'https://muse.ai.evil.example/', 'https://name:secret@muse.ai/', 'https://www.meta.ai/', 'file:///fixture.html']) {
    assert.equal(await adapter.applyPersonalFonts({isDestroyed:()=>false,getURL:()=>url,executeJavaScript:()=>assert.fail('unrelated document inspected')}, true), false);
  }
  assert.equal(await adapter.applyPersonalFonts({isDestroyed:()=>true,getURL:()=>assert.fail('destroyed getter')}, true), false);
});

test('offline fonts load in recognized Muse views, follow attribute hydration, and restore full website typography', {timeout:30000}, async () => {
  assert.equal(typeof adapter.applyPersonalFonts, 'function');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const requests = [], errors = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({contentType:'text/html',body:`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'"><style>#ui{font:500 16px "MuseBench Inter Variable",Arial,sans-serif}#mono{font:italic 400 16px "MuseBench JetBrains Mono Variable",monospace}</style><main><section><p id="ui">Readable interface</p><code id="mono">const answer = 42</code></section></main>`}));
    await page.goto('https://muse.ai/fixture');
    await page.evaluate(() => {window.providerFace=new FontFace('Provider Fixture', 'local(Arial)');document.fonts.add(window.providerFace);});
    await page.evaluate(() => {
      const load = FontFace.prototype.load;
      window.releaseFontLoads = [];
      FontFace.prototype.load = function() {return new Promise(resolve=>window.releaseFontLoads.push(()=>load.call(this).then(resolve)));};
    });
    const sizes = [];
    const contents = {isDestroyed:()=>false,getURL:()=>page.url(),executeJavaScript:script=>{sizes.push(script.length);return page.evaluate(script);}};
    const registered = () => page.evaluate(() => [...document.fonts].filter(face=>face.family.startsWith('MuseBench ')).map(face=>({family:face.family,status:face.status})));
    assert.equal(await adapter.applyPersonalFonts(contents, true), true);
    assert.deepEqual(await registered(), [], 'Unrecognized provider layout keeps its original font set');
    await page.evaluate(() => {document.querySelector('main').setAttribute('data-hatch-full-page-shell','');document.querySelector('section').setAttribute('data-hatch-chat-content','');});
    await page.waitForFunction(() => window.releaseFontLoads.length > 0);
    assert.equal(await adapter.applyPersonalFonts(contents, false), true, 'Pending decoding must not block original-layout restoration');
    await page.evaluate(async () => {await Promise.all(window.releaseFontLoads.map(release=>release()));});
    assert.deepEqual(await registered(), [], 'An old font load must not reactivate a disabled view');
    assert.equal(await adapter.applyPersonalFonts(contents, true), true);
    await page.waitForFunction(() => ['MuseBench Inter Variable','MuseBench JetBrains Mono Variable'].every(family=>[...document.fonts].some(face=>face.family===family&&face.status==='loaded')));
    const faces = await registered();
    const client = await page.context().newCDPSession(page);
    await client.send('DOM.enable'); await client.send('CSS.enable');
    const {root} = await client.send('DOM.getDocument');
    for (const selector of ['#ui','#mono']) {
      const {nodeId} = await client.send('DOM.querySelector',{nodeId:root.nodeId,selector});
      const {fonts} = await client.send('CSS.getPlatformFontsForNode',{nodeId});
      assert(fonts.some(font=>font.isCustomFont&&font.glyphCount>0), `${selector} must render with bundled font bytes, not a named fallback`);
    }
    const initialTransferCount = sizes.length;
    assert.equal(await adapter.applyPersonalFonts(contents, true), true);
    assert.deepEqual(await registered(), faces, 'Appearance refresh must not duplicate font faces');
    assert(sizes.slice(initialTransferCount).every(size=>size<4096), 'Appearance refresh must not resend bundled font bytes');
    await page.evaluate(() => document.querySelector('main').removeAttribute('data-hatch-full-page-shell'));
    await page.waitForFunction(() => ![...document.fonts].some(face=>face.family.startsWith('MuseBench ')));
    await page.evaluate(() => document.querySelector('main').setAttribute('data-hatch-full-page-shell',''));
    await page.waitForFunction(() => [...document.fonts].some(face=>face.family==='MuseBench Inter Variable'));
    assert.equal(await adapter.applyPersonalFonts(contents, false), true);
    assert.deepEqual(await registered(), []);
    assert.equal(await page.evaluate(() => document.fonts.has(window.providerFace)), true, 'Restoration must preserve provider-owned faces');
    await page.evaluate(() => {document.querySelector('section').removeAttribute('data-hatch-chat-content');document.querySelector('section').id='hatch-goals-create';});
    assert.deepEqual(await registered(), [], 'Disabled observer must not reactivate typography');
    assert.equal(await adapter.applyPersonalFonts(contents, true), true);
    await page.waitForFunction(() => [...document.fonts].some(face=>face.family==='MuseBench Inter Variable'));
    await page.reload();
    assert.deepEqual(await registered(), [], 'New documents must have independent font state');
    assert.equal(await adapter.applyPersonalFonts(contents, true), true);
    await page.evaluate(() => {document.querySelector('main').setAttribute('data-hatch-full-page-shell','');document.querySelector('section').className='@container/ideas';});
    await page.waitForFunction(() => [...document.fonts].some(face=>face.family==='MuseBench Inter Variable'&&face.status==='loaded'));
    assert.deepEqual(requests, ['https://muse.ai/fixture','https://muse.ai/fixture'], 'Font loading must not make network requests');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
