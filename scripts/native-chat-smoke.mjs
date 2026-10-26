import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fictional offline transcript only. No user profile, credentials, model call,
// approval, attachment chooser, dictation, or external message is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'scripts/fixtures/personal-native-chat.html'), 'utf8');
const variant = process.env.MUSEBENCH_EXECUTABLE ? 'packaged' : 'source';
const output = path.join(root, 'artifacts/native-chat');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, `${variant}-`));
const dataDir = path.join(fixture, 'data'), screenshots = path.join(fixture, 'screenshots');
await Promise.all([dataDir, screenshots].map(folder => mkdir(folder, { recursive: true })));
const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir, MUSEBENCH_PROJECTS_DIR: path.join(fixture, 'projects') };
delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
const report = { startedAt: new Date().toISOString(), variant, fixture, screenshots, content: 'fictional offline fixture', modelRequests: 0, checks: [], errors: [], mainErrors: [], captures: [] };
let app, page, index = 0;
const record = name => { report.checks.push({ name }); console.log(`PASS ${name}`); };
async function until(predicate, label, timeout = 10000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 60)); } throw Error(`${label}: did not settle`); }
async function state() { return page.evaluate(() => window.musebench.personalState()); }
async function views() { return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => !win.getParentWindow()).contentView.children.filter(view => view.webContents).map(view => ({ id: view.webContents.id, url: view.webContents.getURL(), visible: view.getVisible(), bounds: view.getBounds() })).filter(view => /^https:/.test(view.url))); }
async function visible() { let current; await until(async () => current = (await views()).find(view => view.visible), 'Personal view visible'); return current; }
async function evaluate(id, script) { return app.evaluate(({ webContents }, { id, script }) => webContents.fromId(id).executeJavaScript(script), { id, script }); }
async function resize(width, height) { await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(win => !win.getParentWindow()).setContentSize(...size), [width, height]); await page.waitForFunction(size => Math.abs(innerWidth - size[0]) < 3 && Math.abs(innerHeight - size[1]) < 3, [width, height]); }
async function capture(name) { const view = await visible(); await evaluate(view.id, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); const file = path.join(screenshots, `${String(++index).padStart(2, '0')}-fixture-${name}.png`); const png = await app.evaluate(async ({ webContents }, id) => (await webContents.fromId(id).capturePage()).toPNG().toString('base64'), view.id); await writeFile(file, Buffer.from(png, 'base64')); report.captures.push({ file, surface: 'actual remote fixture view', bounds: view.bounds }); }
async function captureWindow(name) {
  try {
    const capture = await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
      const window = BrowserWindow.getAllWindows().find(win => !win.getParentWindow()), handle = window.getNativeWindowHandle();
      const nativeId = handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1920, height: 1200 }, fetchWindowIcons: false });
      const source = sources.find(source => source.id.startsWith(`window:${nativeId}:`));
      return source && !source.thumbnail.isEmpty() ? { png: source.thumbnail.toPNG().toString('base64'), size: source.thumbnail.getSize() } : null;
    });
    if (!capture) { report.captures.push({ surface: 'combined fixture window', status: 'unavailable' }); return; }
    const file = path.join(screenshots, `${String(++index).padStart(2, '0')}-fixture-${name}-window.png`);
    await writeFile(file, Buffer.from(capture.png, 'base64')); report.captures.push({ file, surface: 'actual combined fixture window', size: capture.size });
  } catch (error) { report.captures.push({ surface: 'combined fixture window', status: 'unavailable', error: error.message }); }
}
async function settings() { await page.keyboard.press('Control+,'); const dialog = page.getByRole('dialog', { name: 'Settings', exact: true }); await dialog.waitFor(); return dialog; }
async function closeSettings() { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor({ state: 'hidden' }); }
async function load(id, url) { await app.evaluate(({ webContents }, { id, url }) => webContents.fromId(id).loadURL(url), { id, url }); await until(async () => evaluate(id, 'Boolean(window.__nativeChatFixture)'), 'Fixture document ready'); }
async function insert(id, text) { await evaluate(id, `(document.querySelector('textarea[data-hatch-composer-prehydration-input],[contenteditable="true"]')).focus()`); await app.evaluate(({ webContents }, { id, text }) => { const remote = webContents.fromId(id); remote.focus(); remote.insertText(text); }, { id, text }); }
async function styles(id) { return evaluate(id, `(()=>{const style=selector=>getComputedStyle(document.querySelector(selector));const user=style('[data-message-role="user"] .hatch-chat-groupable-bubble'),assistant=style('[data-message-role="assistant"] .hatch-chat-groupable-bubble'),log=style('[role="log"]'),composer=style('[data-hatch-composer-chrome]'),input=style('textarea[data-hatch-composer-prehydration-input],[contenteditable="true"]');return {background:getComputedStyle(document.body).backgroundColor,userBackground:user.backgroundColor,userRadius:user.borderRadius,assistantBackground:assistant.backgroundColor,assistantPadding:assistant.padding,logSize:log.fontSize,logFont:log.fontFamily,logWidth:log.maxWidth,lineHeight:log.lineHeight,composerBackground:composer.backgroundColor,composerRadius:composer.borderRadius,inputMinHeight:input.minHeight,inputFontSize:input.fontSize,codeFont:style('pre code').fontFamily,dock:style('[data-hatch-dock]').display}})()`); }
async function draft(id) { return evaluate(id, `(()=>{const input=document.querySelector('textarea[data-hatch-composer-prehydration-input],[contenteditable="true"]');return input.tagName==='TEXTAREA'?input.value:input.textContent})()`); }
function contrast(foreground, background) {
  const luminance = color => { const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(value => { const channel = Number(value) / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05);
}
async function auxiliaryColors(id, theme) {
  const colors = await evaluate(id, `Array.from(document.querySelectorAll('[data-pel-click="chat_tap_attachment"],[data-pel-click="chat_tap_dictation"]')).map(button=>{const style=getComputedStyle(button);return {title:button.getAttribute('aria-label'),foreground:style.color,background:style.backgroundColor,border:style.borderColor,composer:getComputedStyle(button.closest('[data-hatch-composer-chrome]')).backgroundColor}})`);
  assert.equal(colors.length, 2);
  for (const color of colors) { assert.equal(color.background, 'rgba(0, 0, 0, 0)', `${theme} ${color.title} background`); assert.equal(color.border, 'rgba(0, 0, 0, 0)', `${theme} ${color.title} border`); assert(contrast(color.foreground, color.composer) >= 4.5, `${theme} composer control contrast: ${JSON.stringify(color)}`); }
  return colors;
}
async function invariants(id, original) { const current = await evaluate(id, `({documentId:window.__nativeChatFixture.documentId,messages:Array.from(document.querySelectorAll('[data-message-item]')).map(node=>node.textContent),streaming:document.querySelector('[data-hatch-markdown-streaming="true"]')?.getAttribute('data-hatch-markdown-streaming'),sends:window.__nativeChatFixture.sends.length,approvals:window.__nativeChatFixture.approvals,attachments:window.__nativeChatFixture.attachments,dictations:window.__nativeChatFixture.dictations})`); assert.deepEqual(current, original); }

try {
  app = await electron.launch({ cwd: root, args: process.env.MUSEBENCH_EXECUTABLE ? [] : ['.'], ...(process.env.MUSEBENCH_EXECUTABLE ? { executablePath: process.env.MUSEBENCH_EXECUTABLE } : {}), env, timeout: 30000 });
  app.process().stderr.on('data', data => { for (const line of data.toString().split(/\r?\n/)) if (line.includes('NATIVE_CHAT_MAIN_ERROR ')) report.mainErrors.push(line); });
  await app.evaluate(({ dialog }) => { const capture = error => process.stderr.write(`NATIVE_CHAT_MAIN_ERROR ${String(error?.stack || error)}\n`); process.on('uncaughtExceptionMonitor', capture); dialog.showErrorBox = (title, detail) => capture(`${title}: ${detail}`); });
  page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.musebench)); await resize(1440, 900);
  await app.evaluate(async ({ session }, html) => {
    for (const partition of ['persist:musebench-personal-muse', 'persist:musebench-personal-chat']) await session.fromPartition(partition).protocol.handle('https', request => {
      const url = new URL(request.url); if (!['muse.ai', 'auth.muse.ai', 'www.meta.ai', 'meta.ai'].includes(url.hostname)) return new Response('Offline fixture refused host', { status: 451 });
      const body = url.pathname === '/fixture-unrecognized' ? html.replace('<div data-hatch-chat-content>', '<div data-fixture-unrecognized>') : html;
      return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    });
  }, html);
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  await page.getByRole('navigation', { name: 'Meta AI navigation', exact: true }).getByRole('button', { name: 'Muse AI bot', exact: true }).click();
  let muse = await visible(); await until(async () => evaluate(muse.id, 'Boolean(window.__nativeChatFixture)'), 'Muse rich fixture loaded');
  const original = await evaluate(muse.id, `({documentId:window.__nativeChatFixture.documentId,messages:Array.from(document.querySelectorAll('[data-message-item]')).map(node=>node.textContent),streaming:document.querySelector('[data-hatch-markdown-streaming="true"]')?.getAttribute('data-hatch-markdown-streaming'),sends:window.__nativeChatFixture.sends.length,approvals:window.__nativeChatFixture.approvals,attachments:window.__nativeChatFixture.attachments,dictations:window.__nativeChatFixture.dictations})`);
  await until(async () => (await styles(muse.id)).userRadius === '18px', 'Native chat bubble styling is applied');
  let current = await styles(muse.id); report.initialStyles = current;
  assert.equal(current.userBackground, 'rgb(48, 48, 48)'); assert.equal(current.assistantBackground, 'rgba(0, 0, 0, 0)'); assert.equal(current.assistantPadding, '0px'); assert.equal(current.logSize, '14px'); assert.equal(current.logWidth, '800px'); assert.equal(current.composerRadius, '16px'); assert.equal(current.inputMinHeight, '52px');
  assert.match(current.codeFont, /Cascadia|Consolas|monospace/i);
  const desktop = await evaluate(muse.id, `(()=>{const feedNode=document.querySelector('[data-hatch-vt-pane="chat-feed"]'),feed=feedNode.getBoundingClientRect(),log=document.querySelector('[role="log"]'),rect=log.getBoundingClientRect(),style=getComputedStyle(log),composer=document.querySelector('[data-hatch-composer-chrome]').getBoundingClientRect(),panel=document.querySelector('[data-hatch-status-panel-card]').getBoundingClientRect();return {feedRight:feed.right,scrollbarWidth:feed.width-feedNode.clientWidth,panelLeft:panel.left,logRight:rect.right,textLeft:rect.left+parseFloat(style.paddingLeft),textRight:rect.right-parseFloat(style.paddingRight),composerLeft:composer.left,composerRight:composer.right}})()`);
  assert(desktop.feedRight <= desktop.panelLeft + 1 && desktop.logRight <= desktop.feedRight + 1, JSON.stringify(desktop));
  assert(Math.abs(desktop.textLeft - desktop.composerLeft) <= 4 && Math.abs(desktop.textRight - desktop.composerRight) <= desktop.scrollbarWidth + 4, JSON.stringify(desktop));
  const approvalColors = await evaluate(muse.id, `Array.from(document.querySelectorAll('[data-hatch-status-panel-card] button')).map(button=>{const style=getComputedStyle(button);return {title:button.textContent,foreground:style.color,background:style.backgroundColor==='rgba(0, 0, 0, 0)'?getComputedStyle(button.closest('[data-hatch-status-panel-card]')).backgroundColor:style.backgroundColor}})`);
  for (const color of approvalColors) assert(contrast(color.foreground, color.background) >= 4.5, `Approval control text contrast: ${JSON.stringify(color)}`);
  report.desktopGeometry = desktop; report.approvalColors = approvalColors;
  report.darkAuxiliaryColors = await auxiliaryColors(muse.id, 'Dark');
  const placeholder = await evaluate(muse.id, `(()=>{const text=document.querySelector('[data-hatch-composer-placeholder-label]').getBoundingClientRect(),element=document.querySelector('textarea'),input=element.getBoundingClientRect();return {textLeft:text.left,inputLeft:input.left,textTop:text.top,textBottom:text.bottom,inputTop:input.top,inputLineHeight:parseFloat(getComputedStyle(element).lineHeight)}})()`);
  assert(Math.abs(placeholder.textLeft-placeholder.inputLeft) <= 1 && placeholder.textTop >= placeholder.inputTop - 1 && placeholder.textBottom <= placeholder.inputTop + placeholder.inputLineHeight + 1, JSON.stringify(placeholder)); report.placeholderGeometry = placeholder;
  await capture('dark-rich-chat');
  await captureWindow('dark-rich-chat');
  record('Native dark transcript, user bubbles, assistant prose, code, and composer receive the intended styling');

  await insert(muse.id, 'Keep this unfinished Muse draft.');
  await until(async () => await draft(muse.id) === 'Keep this unfinished Muse draft.', 'Original textarea accepts input');
  const toggle = page.getByRole('button', { name: 'Use integrated Muse layout', exact: true });
  await toggle.click(); await until(async () => (await styles(muse.id)).userRadius === '30px', 'Full website styling restored');
  current = await styles(muse.id); assert.equal(current.userBackground, 'rgb(72, 94, 164)'); assert.equal(current.logSize, '18px'); assert.equal(current.composerRadius, '30px'); assert.notEqual(current.dock, 'none');
  assert.equal(await draft(muse.id), 'Keep this unfinished Muse draft.'); await invariants(muse.id, original); await capture('original-website');
  await toggle.click(); await until(async () => (await styles(muse.id)).userRadius === '18px', 'Native styling restored');
  record('Native/full-layout switching restores original website styles without recreating messages, losing drafts, or invoking controls');

  let dialog = await settings();
  await dialog.getByRole('button', { name: 'Light theme', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Response font', exact: true }).selectOption('mono');
  await dialog.getByRole('combobox', { name: 'Transcript text size', exact: true }).selectOption('large');
  await dialog.getByRole('switch', { name: 'Reduce motion', exact: true }).click();
  await closeSettings();
  await until(async () => { const appearance = (await state()).appearance; return appearance?.theme === 'light' && appearance?.font === 'mono' && appearance?.textSize === 'large' && appearance?.reducedMotion; }, 'Settings appearance reaches the personal browser');
  await until(async () => (await styles(muse.id)).userBackground === 'rgb(229, 228, 224)', 'Light native colors applied');
  current = await styles(muse.id); assert.equal(current.logSize, '16px'); assert.match(current.logFont, /Cascadia|Consolas|monospace/i); assert.equal(current.composerBackground, 'rgb(255, 255, 255)');
  const lightApprovalColors = await evaluate(muse.id, `Array.from(document.querySelectorAll('[data-hatch-status-panel-card] button')).map(button=>{const style=getComputedStyle(button);return {title:button.textContent,foreground:style.color,background:style.backgroundColor==='rgba(0, 0, 0, 0)'?getComputedStyle(button.closest('[data-hatch-status-panel-card]')).backgroundColor:style.backgroundColor}})`);
  for (const color of lightApprovalColors) assert(contrast(color.foreground, color.background) >= 4.5, `Light approval control text contrast: ${JSON.stringify(color)}`);
  report.lightApprovalColors = lightApprovalColors;
  report.lightAuxiliaryColors = await auxiliaryColors(muse.id, 'Light');
  const motion = await evaluate(muse.id, `(()=>{const style=getComputedStyle(document.querySelector('.fixture-motion'));return {name:style.animationName,duration:parseFloat(style.animationDuration)}})()`); assert(motion.name === 'none' || motion.duration < 0.01);
  assert.equal(await draft(muse.id), 'Keep this unfinished Muse draft.'); await invariants(muse.id, original); await capture('light-large-monospace');
  record('Local theme, response font, text size, and reduced-motion preferences update the retained official document');

  await evaluate(muse.id, 'window.__nativeChatFixture.hydrateEditable()');
  await until(async () => (await styles(muse.id)).inputMinHeight === '52px', 'Hydrated contenteditable inherits composer styling');
  assert.equal(await draft(muse.id), 'Keep this unfinished Muse draft.');
  await insert(muse.id, ' Hydrated input works.');
  assert.equal(await draft(muse.id), ' Hydrated input works.Keep this unfinished Muse draft.');
  await invariants(muse.id, original);
  const controlGeometry = await evaluate(muse.id, `(()=>{const chrome=document.querySelector('[data-hatch-composer-chrome]').getBoundingClientRect();return ['chat_tap_attachment','chat_tap_dictation','chat_send_message'].map(action=>{const element=document.querySelector('[data-pel-click="'+action+'"]'),rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {action,visible:style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0,inside:rect.left>=chrome.left&&rect.right<=chrome.right&&rect.top>=chrome.top&&rect.bottom<=chrome.bottom}})})()`); assert(controlGeometry.every(value => value.visible && value.inside), JSON.stringify(controlGeometry));
  record('Late contenteditable hydration keeps native composer styling and original attachment, dictation, and send controls');

  await resize(390, 844); await until(async () => (await visible()).bounds.width < 410, 'Narrow remote view sized');
  const narrow = await evaluate(muse.id, `(()=>{const chrome=document.querySelector('[data-hatch-composer-chrome]').getBoundingClientRect(),log=document.querySelector('[role="log"]').getBoundingClientRect(),code=document.querySelector('pre');return {width:innerWidth,body:document.body.scrollWidth,document:document.documentElement.scrollWidth,composer:{left:chrome.left,right:chrome.right,bottom:chrome.bottom},log:{left:log.left,right:log.right},height:innerHeight,codeScrolls:code.scrollWidth>code.clientWidth}})()`);
  assert(narrow.body <= narrow.width + 1 && narrow.document <= narrow.width + 1, JSON.stringify(narrow)); assert(narrow.composer.left >= 0 && narrow.composer.right <= narrow.width + 1 && narrow.composer.bottom <= narrow.height + 1, JSON.stringify(narrow)); assert(narrow.log.left >= 0 && narrow.log.right <= narrow.width + 1, JSON.stringify(narrow)); assert.equal(narrow.codeScrolls, true);
  await capture('narrow-chat-composer');
  await evaluate(muse.id, `document.querySelector('[data-hatch-status-panel-card]').scrollIntoView({block:'center'})`);
  await evaluate(muse.id, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const approvals = await evaluate(muse.id, `(()=>{const card=document.querySelector('[data-hatch-status-panel-card]'),control=document.querySelector('#fixture-approval'),rect=control.getBoundingClientRect(),style=getComputedStyle(card),composer=document.querySelector('[data-hatch-composer-chrome]').getBoundingClientRect();return {display:style.display,visibility:style.visibility,text:card.textContent,buttonVisible:rect.width>0&&rect.height>0&&rect.top>=0&&rect.bottom<=composer.top,top:rect.top,bottom:rect.bottom,composerTop:composer.top,invocations:window.__nativeChatFixture.approvals}})()`); report.approvalGeometry = approvals; assert.notEqual(approvals.display, 'none'); assert.notEqual(approvals.visibility, 'hidden'); assert.equal(approvals.buttonVisible, true, JSON.stringify(approvals)); assert.match(approvals.text, /Approvals/); assert.equal(approvals.invocations, 0);
  await invariants(muse.id, original); await capture('narrow-approvals');
  record('Narrow chat wraps and scrolls code locally while keeping the composer and original approval surface available');

  await resize(1440, 900);
  await load(muse.id, 'https://muse.ai/fixture-unrecognized');
  await until(async () => (await styles(muse.id)).userRadius === '30px', 'Unrecognized chat structure retains its original styles');
  assert.equal((await styles(muse.id)).userBackground, 'rgb(72, 94, 164)');
  await load(muse.id, 'https://auth.muse.ai/fixture-login');
  current = await styles(muse.id); assert.equal(current.userRadius, '30px'); assert.equal(current.composerRadius, '30px'); assert.notEqual(current.dock, 'none');
  await page.getByRole('navigation', { name: 'Meta AI navigation', exact: true }).getByRole('button', { name: 'Chat', exact: true }).click();
  const meta = await visible(); await until(async () => evaluate(meta.id, 'Boolean(window.__nativeChatFixture)'), 'Meta AI fixture loaded');
  current = await styles(meta.id); assert.equal(current.userRadius, '30px'); assert.notEqual(current.dock, 'none');
  record('Unknown layouts, authentication origins, and the separate Meta AI chat retain their original presentation');

  assert.deepEqual(await evaluate(meta.id, '({bridge:typeof window.musebench,require:typeof window.require,process:typeof window.process})'), { bridge: 'undefined', require: 'undefined', process: 'undefined' });
  const prefs = await app.evaluate(({ webContents }, id) => webContents.fromId(id).getLastWebPreferences(), meta.id); assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert(!prefs.preload);
  await app.close(); app = null; page = null; assert.deepEqual(report.errors, []); assert.deepEqual(report.mainErrors, []);
  record('Remote pages remain sandboxed without a local bridge; no message, approval, or privileged control was invoked');
  report.status = 'passed'; report.completedAt = new Date().toISOString();
} catch (error) { report.status = 'failed'; report.error = error.stack; console.error(error); process.exitCode = 1; if (page && !page.isClosed()) report.failureState = await state().catch(() => null); if (app) await capture('failure').catch(() => {}); }
finally { if (app) await app.close().catch(error => report.errors.push(error.message)); await writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2)); console.log(`Report: ${path.join(fixture, 'report.json')}`); }
