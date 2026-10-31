import test from 'node:test';
import assert from 'node:assert/strict';

const policy = await import('../electron/personal-policy.mjs').catch(() => ({}));

test('prewarm accepts only known section hints without navigation or chat mutation fields', () => {
  for (const target of ['bot', 'ideas', 'goals', 'muse-search', 'muse-feed', 'muse-library', 'meta-chat', 'meta-search', 'meta-media', 'meta-artifacts', 'meta-scheduled', 'meta-vibes']) {
    const command = { type: 'prewarm', target };
    assert.deepEqual(policy.validatePersonalCommand(command), command);
  }
  for (const target of [undefined, null, [], {}, '', 'chat', 'newChat', 'newMuseChat', 'settings', 'meta-newChat', 'https://www.meta.ai/', '__proto__', 'constructor', 'bot '.repeat(100)]) {
    assert.throws(() => policy.validatePersonalCommand({ type: 'prewarm', target }));
  }
  for (const extra of [{ action: 'newChat' }, { destination: 'chat' }, { prompt: 'Send this now' }, { id: 'thread-123' }, { url: 'https://muse.ai/' }, { visible: true }]) {
    assert.throws(() => policy.validatePersonalCommand({ type: 'prewarm', target: 'meta-chat', ...extra }));
  }
});

test('the observed Meta AI authentication redirect is allowed as an exact HTTPS host',()=>{
 assert.equal(policy.allowedPersonalURL('https://auth.meta.ai/'),true);
 assert.equal(policy.personalAuthenticating('https://auth.meta.ai/'),true);
 for(const url of ['http://auth.meta.ai/','https://auth.meta.ai.evil.example/','https://auth.meta.ai@evil.example/','https://other.meta.ai/'])assert.equal(policy.allowedPersonalURL(url),false);
});

test('appearance commands accept only a complete finite snapshot with no CSS or extra fields', () => {
  const appearance = { theme: 'light', textSize: 'large', font: 'mono', reducedMotion: true };
  assert.deepEqual(policy.validatePersonalCommand({ type: 'appearance', appearance }), { type: 'appearance', appearance });
  for (const patch of [{ theme: 'system' }, { theme: '#fff' }, { textSize: 16 }, { font: 'system; color:red' }, { reducedMotion: 'false' }, { css: 'body{}' }]) assert.throws(() => policy.validatePersonalCommand({ type: 'appearance', appearance: { ...appearance, ...patch } }));
  for (const value of [null, [], {}, { theme: 'dark' }, Object.create(appearance)]) assert.throws(() => policy.validatePersonalCommand({ type: 'appearance', appearance: value }));
  assert.throws(() => policy.validatePersonalCommand({ type: 'appearance', appearance, compact: true }));
});

test('native library commands accept only opaque bounded IDs and fixed actions', () => {
  for (const command of [{ type: 'refreshLibrary' }, { type: 'newMuseChat' }, { type: 'selectItem', id: 'opaque-item-123' }]) assert.deepEqual(policy.validatePersonalCommand(command), command);
  for (const command of [{ type: 'selectItem', id: '' }, { type: 'selectItem', id: 'x'.repeat(129) }, { type: 'selectItem', id: 'https://muse.ai/thread/a' }, { type: 'selectItem', id: 'safe', url: 'https://muse.ai/thread/a' }, { type: 'refreshLibrary', account: 'other' }, { type: 'newMuseChat', prompt: 'send a message' }]) assert.throws(() => policy.validatePersonalCommand(command));
});

test('observed Muse thread routes keep the bot section active', () => {
  assert.equal(policy.personalRoute('https://muse.ai/thread/new'), 'bot');
  assert.equal(policy.personalRoute('https://muse.ai/thread/a_123-test'), 'bot');
  for (const url of ['https://muse.ai/thread/a/b', 'https://muse.ai/thread/%2f', 'https://muse.ai/thread/', 'https://auth.muse.ai/thread/a']) assert.equal(policy.personalRoute(url), null);
});

test('personal navigation uses only verified official destinations', () => {
  assert.equal(typeof policy.personalTarget, 'function', 'personal destination policy is implemented');
  assert.equal(policy.personalTarget('bot'), 'https://muse.ai/');
  assert.equal(policy.personalTarget('chat'), 'https://www.meta.ai/');
  assert.equal(policy.personalTarget('ideas'), 'https://muse.ai/ideas');
  assert.equal(policy.personalTarget('goals'), 'https://muse.ai/goals');
  assert.deepEqual(policy.personalAvailability(), { bot: true, chat: true, ideas: true, goals: true });
  assert.equal(policy.personalTarget('https://evil.example'), null);
});

test('remote top-level navigation rejects lookalikes, credentials and unsafe schemes', () => {
  assert.equal(typeof policy.allowedPersonalURL, 'function', 'personal navigation policy is implemented');
  for (const url of ['https://muse.ai/', 'https://auth.muse.ai/aymh/?origin=https://muse.ai', 'https://www.meta.ai/', 'https://meta.ai/', 'https://www.facebook.com/', 'https://www.instagram.com/']) assert.equal(policy.allowedPersonalURL(url), true, url);
  for (const url of ['file:///C:/Windows', 'javascript:alert(1)', 'http://muse.ai/', 'https://muse.ai.evil.com/', 'https://muse.ai@evil.com/', 'https://user:password@muse.ai/', 'https://muse.ai:9999/', 'https://evil.example/', 'https://sub.muse.ai/', 'https://www.facebook.com.evil.example/', 'https://www.facebook.com@evil.example/', 'https://facebook.com/', 'https://sub.facebook.com/', 'https://www.instagram.com.evil.example/', 'https://www.instagram.com@evil.example/', 'https://instagram.com/', 'https://sub.instagram.com/']) assert.equal(policy.allowedPersonalURL(url), false, url);
  assert.equal(policy.personalOrigin('https://www.facebook.com/login/?private=oauth-token'), 'https://www.facebook.com');
  assert.equal(policy.personalOrigin('https://www.instagram.com/accounts/login/?private=oauth-token'), 'https://www.instagram.com');
});

test('the observed Meta authentication origin is allowed without widening to other Meta hosts', () => {
  assert.equal(policy.allowedPersonalURL('https://auth.meta.com/'), true);
  assert.equal(policy.personalOrigin('https://auth.meta.com/?private=oauth-token'), 'https://auth.meta.com');
  for (const url of ['https://meta.com/', 'https://sub.meta.com/', 'https://auth.meta.com.evil.example/', 'https://auth.meta.com@evil.example/']) assert.equal(policy.allowedPersonalURL(url), false, url);
});

test('personal IPC accepts only defined commands and finite bounded layout values', () => {
  assert.equal(typeof policy.validatePersonalCommand, 'function', 'personal command validation is implemented');
  assert.deepEqual(policy.validatePersonalCommand({ type: 'layout', visible: false }), { type: 'layout', visible: false });
  assert.deepEqual(policy.validatePersonalCommand({ type: 'navigate', destination: 'bot' }), { type: 'navigate', destination: 'bot' });
  for (const command of [{ type: 'navigate', destination: 'https://evil.example' }, { type: 'navigate', destination: 'bot', url: 'https://evil.example' }, { type: 'layout', visible: 'yes' }, { type: 'layout', visible: true }, { type: 'layout', visible: true, bounds: { x: 0, y: 0, width: Infinity, height: 5 } }, { type: 'layout', visible: true, bounds: { x: 0, y: 0, width: 2, height: -1 } }, { type: 'execute', script: 'anything' }, null]) assert.throws(() => policy.validatePersonalCommand(command));
});

test('CSS bounds are converted for zoom and clipped to native window content', () => {
  assert.equal(typeof policy.clampPersonalBounds, 'function', 'native layout conversion is implemented');
  assert.deepEqual(policy.clampPersonalBounds({ x: 300, y: 70, width: 500, height: 400 }, 1.25, [1000, 600]), { x: 375, y: 88, width: 625, height: 500 });
  assert.deepEqual(policy.clampPersonalBounds({ x: 900, y: 550, width: 500, height: 400 }, 1, [1000, 600]), { x: 900, y: 550, width: 100, height: 50 });
  assert.deepEqual(policy.clampPersonalBounds({ x: 1200, y: 700, width: 500, height: 400 }, 1, [1000, 600]), { x: 1000, y: 600, width: 0, height: 0 });
});

test('section detection uses only verified service origins and path boundaries', () => {
  assert.equal(typeof policy.personalRoute, 'function');
  for (const [url, section] of [['https://muse.ai/', 'bot'], ['https://muse.ai/ideas?private=secret', 'ideas'], ['https://muse.ai/goals/123', 'goals'], ['https://www.meta.ai/c/123', 'chat'], ['https://meta.ai/', 'chat'], ['https://muse.ai/goals-evil', null], ['https://muse.ai/settings', null], ['https://auth.muse.ai/', null], ['https://evil.example/ideas', null]]) assert.equal(policy.personalRoute(url), section, url);
  assert.equal(policy.personalAuthenticating('https://www.facebook.com/login/?private=secret'), true);
  assert.equal(policy.personalAuthenticating('https://auth.muse.ai/'), true);
  assert.equal(policy.personalAuthenticating('https://muse.ai/'), false);
});

test('popup policy requires an official HTTPS opener and target, rejecting credentials and unsafe schemes', () => {
  assert.equal(typeof policy.allowedPersonalPopupURL, 'function');
  assert.equal(policy.allowedPersonalPopupURL('https://auth.meta.com/login/?state=secret', 'https://muse.ai/'), true);
  for (const target of ['https://evil.example/', 'https://user:password@www.facebook.com/', 'http://auth.muse.ai/', 'javascript:alert(1)', 'file:///C:/Windows']) assert.equal(policy.allowedPersonalPopupURL(target, 'https://muse.ai/'), false, target);
  assert.equal(policy.allowedPersonalPopupURL('https://www.facebook.com/', 'https://evil.example/'), false);
});

test('presentation and service action commands accept only bounded documented fields', () => {
  for (const command of [{ type: 'presentation', compact: true }, { type: 'dismissNotice' }, ...['search', 'feed', 'library', 'settings', 'connections', 'whatsapp'].map(action => ({ type: 'serviceAction', action }))]) assert.deepEqual(policy.validatePersonalCommand(command), command);
  for (const command of [{ type: 'presentation', compact: 'true' }, { type: 'presentation', compact: true, script: 'evil' }, { type: 'serviceAction', action: 'eval' }, { type: 'serviceAction', action: 'whatsapp', url: 'https://evil.example' }, { type: 'dismissNotice', token: 'secret' }]) assert.throws(() => policy.validatePersonalCommand(command));
});

test('account management is allowed only in owned popups, with exact trusted origins', () => {
  const opener='https://www.meta.ai/';
  assert.equal(policy.allowedPersonalPopupURL('https://accountscenter.meta.com/',opener),true);
  assert.equal(policy.allowedPersonalAccountURL?.('https://accountscenter.meta.com/subscriptions'),true);
  assert.equal(policy.allowedPersonalURL('https://accountscenter.meta.com/'),false,'chat pages keep their narrower boundary');
  assert.equal(policy.allowedPersonalPopupURL('about:blank',opener),true,'Meta can reserve a popup before asynchronously choosing its URL');
  for(const url of ['https://accountscenter.meta.com.evil.example/','https://accountscenter.meta.com:9999/','https://user@accountscenter.meta.com/','http://accountscenter.meta.com/','https://accounts.google.com/','about:srcdoc','about:blank#unexpected'])assert.equal(policy.allowedPersonalAccountURL?.(url),false,url);
  assert.equal(policy.allowedPersonalPopupURL('about:blank','file:///app/index.html'),false);
  assert.equal(policy.allowedPersonalPopupURL('about:blank','about:blank'),false);
});

test('Meta settings accepts only navigation sections, never purchases or connection consent',()=>{
  for(const section of ['general','apps'])assert.deepEqual(policy.validatePersonalCommand({type:'metaSettings',section}),{type:'metaSettings',section});
  for(const command of [{type:'metaSettings',section:'upgrade'},{type:'metaSettings',section:'apps',url:'https://evil.example'},{type:'metaSettings',section:'apps',connect:true}])assert.throws(()=>policy.validatePersonalCommand(command));
});
