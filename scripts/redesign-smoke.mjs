import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Real renderer/controller integration only. Manual/tutorial tasks execute
// locally; Muse discovery is isolated so connection failures stay offline.
// No model requests or user-data changes are made.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
const variant = process.env.MUSEBENCH_EXECUTABLE ? 'packaged' : 'source';
const output = path.join(artifacts, 'redesign-ui');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, `${variant}-`));
const dataDir = path.join(fixture, 'data');
const projectsDir = path.join(fixture, 'projects');
const screenshots = path.join(fixture, 'screenshots');
await Promise.all([dataDir, projectsDir, screenshots].map(folder => mkdir(folder, { recursive: true })));
const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir, MUSEBENCH_PROJECTS_DIR: projectsDir };
// Keep these offline UI checks from discovering the installed Muse runtime.
for (const key of Object.keys(env)) {
  if (key.toUpperCase() === 'PATH') env[key] = env[key].split(';').filter(folder => !/muse/i.test(folder)).join(';');
  if (key.toUpperCase() === 'LOCALAPPDATA') env[key] = env.MUSEBENCH_DATA_DIR;
}
delete env.ELECTRON_RUN_AS_NODE;
delete env.MUSEBENCH_DEV;
const report = { startedAt: new Date().toISOString(), variant, fixture, dataDir, projectsDir, screenshots, modelRequests: 0, checks: [], errors: [] };
let app;
let page;
let screenshotIndex = 0;
const record = (name, details) => { report.checks.push({ name, ...(details ? { details } : {}) }); console.log(`PASS ${name}`); };
const launch = () => electron.launch({
  cwd: root,
  args: process.env.MUSEBENCH_EXECUTABLE ? [] : ['.'],
  ...(process.env.MUSEBENCH_EXECUTABLE ? { executablePath: process.env.MUSEBENCH_EXECUTABLE } : {}),
  env,
  timeout: 30000,
});
async function openApp() {
  app = await launch();
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.musebench));
  await page.setViewportSize({ width: 1440, height: 900 });
  return page;
}
async function state() { return page.evaluate(() => window.musebench.getState()); }
async function untilState(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await state();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw Error(`${label}: state did not settle: ${JSON.stringify({ error: value?.error, busy: value?.busy, taskId: value?.task?.id, projectId: value?.activeProject?.id })}`);
}
async function dispatch(action) {
  const next = await page.evaluate(action => window.musebench.dispatch(action), action);
  assert.equal(next.error, null, `${action.type} failed`);
  return next;
}
async function shot(name) {
  const file = path.join(screenshots, `${String(++screenshotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
async function assertNoOverflow(label) {
  const bounds = await page.evaluate(() => ({ width: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(bounds.document <= bounds.width + 1, `${label}: document overflow ${JSON.stringify(bounds)}`);
  assert(bounds.body <= bounds.width + 1, `${label}: body overflow ${JSON.stringify(bounds)}`);
}
async function settings() {
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.waitFor();
  return dialog;
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function selectSearchResult(title, taskId) {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search MuseBench', exact: true });
  await dialog.waitFor();
  const search = dialog.getByRole('textbox', { name: 'Search projects and chats', exact: true });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search projects and chats');
  assert(await search.evaluate(element => element === document.activeElement), 'Ctrl+K should focus the search textbox');
  await search.fill(title);
  await dialog.locator('.library-open').filter({ hasText: title }).click();
  await untilState(value => !value.busy && value.task?.id === taskId, `Search result ${title}`);
  await dialog.waitFor({ state: 'hidden' });
}

try {
  await openApp();
  await page.getByRole('button', { name: 'New chat', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Search chats', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Profile menu', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Try sample project', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ process: typeof window.process, require: typeof window.require })), { process: 'undefined', require: 'undefined' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await assertNoOverflow('1440px empty welcome');
  await shot('welcome-dark');
  record('Dark welcome presents chat navigation and composer in an isolated renderer');
  assert.equal(await page.locator('.activity-rail').count(), 0);
  const projectsSection=page.locator('.sidebar-section').filter({has:page.getByRole('button',{name:'Collapse Projects',exact:true})});
  await page.getByRole('button',{name:'Collapse Projects',exact:true}).click();
  assert.equal(await projectsSection.count(),0);
  await page.getByRole('button',{name:'Expand Projects',exact:true}).click();
  await page.getByRole('button',{name:'Collapse Recents',exact:true}).click();
  await page.getByRole('button',{name:'Search chats',exact:true}).click();
  await page.getByRole('dialog',{name:'Search MuseBench',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Expand Recents',exact:true}).click();
  record('Single sidebar collapses sections while keeping chat search available');


  assert.equal(await page.getByRole('button',{name:'Customize',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Customize workspace',exact:true}).count(),0);
  const profile=()=>page.getByRole('button',{name:'Profile menu',exact:true}).filter({visible:true});
  await profile().click();await page.getByRole('menu',{name:'Your profile',exact:true}).waitFor();
  await shot('profile-dark');await page.locator('.profile-popover').screenshot({path:path.join(screenshots,'profile-menu-crop.png')});
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'SettingsCtrl+,');
  await page.keyboard.press('Escape');assert.equal(await profile().getAttribute('aria-expanded'),'false');assert(await profile().evaluate(node=>node===document.activeElement));
  await profile().click();await page.getByRole('menuitem',{name:'Settings Ctrl+,',exact:true}).click();
  await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();assert.equal(await page.getByRole('menu',{name:'Your profile',exact:true}).count(),0);await closeDialog();
  record('Profile menu keeps general Settings separate from Customize and opens Settings with keyboard dismissal and focus restoration');

  let dialog = await settings();
  await dialog.getByRole('button', { name: 'Light theme', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await closeDialog();await profile().click();await shot('profile-light');await page.keyboard.press('Escape');dialog=await settings();
  await dialog.getByRole('combobox', { name: 'Transcript text size', exact: true }).selectOption('large');
  assert.equal(await page.locator('html').getAttribute('data-text-size'), 'large');
  await shot('settings-light-large');
  await closeDialog();
  await app.close(); app = null;
  await openApp();
  await page.getByRole('button', { name: 'New chat', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('html').getAttribute('data-text-size'), 'large');
  dialog = await settings();
  assert.equal(await dialog.getByRole('button', { name: 'Light theme', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await dialog.getByRole('combobox', { name: 'Transcript text size', exact: true }).inputValue(), 'large');
  await dialog.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Transcript text size', exact: true }).selectOption('medium');
  await shot('settings-dark');
  await page.setViewportSize({ width: 1540, height: 900 });
  await assertNoOverflow('1540px settings reference');
  await shot('settings-reference-size');
  await page.setViewportSize({ width: 1440, height: 900 });
  await closeDialog();
  record('Ctrl+, opens Settings; theme and text-size choices persist through a full restart');

  const sidebarToggle = page.getByRole('complementary', { name: 'Projects and chats', includeHidden: true }).getByRole('button', { name: 'Toggle sidebar', exact: true, includeHidden: true });
  const sidebarInitial = await sidebarToggle.getAttribute('aria-expanded');
  assert(['true', 'false'].includes(sidebarInitial), 'Sidebar toggle must expose expanded state');
  await page.keyboard.press('Control+b');
  assert.equal(await sidebarToggle.getAttribute('aria-expanded'), sidebarInitial === 'true' ? 'false' : 'true');
  assert.equal(await profile().count(),0);
  await page.keyboard.press('Control+,');await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  assert.equal(await sidebarToggle.getAttribute('aria-expanded'), sidebarInitial);
  record('Ctrl+B toggles and restores the project/chat sidebar');

  await page.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Prompt starters', exact: true }).click();
  await page.getByRole('heading', { name: 'Prompt starters', exact: true }).waitFor();
  await shot('customize');
  await page.getByRole('button', { name: 'Use starter: Find and fix a bug', exact: true }).click();
  const starter = await page.getByRole('textbox', { name: 'Message Muse', exact: true }).inputValue();
  assert(starter.length > 30 && /bug/i.test(starter), 'Prompt starter must fill the editable composer with a meaningful request');
  assert.equal((await state()).task, null, 'Choosing a starter must not create or run a task');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Message Muse', exact: true }).inputValue(), starter);
  record('Customize inserts an editable prompt without executing it; New chat preserves the unsent draft');

  await page.getByRole('button', { name: 'Try sample project', exact: true }).click();
  const demo = await untilState(value => !value.busy && value.task?.mode === 'demo', 'Create tutorial');
  const demoTask = { id: demo.task.id, title: demo.task.title, projectId: demo.activeProject.id, baselineRevision: demo.task.baselineRevision };
  await page.getByRole('button', { name: 'Toggle review panel', exact: true }).click();
  await page.getByRole('button', { name: 'Approve plan', exact: true }).click();
  await untilState(value => !value.busy && value.task?.planApproved, 'Approve tutorial plan');
  const editedDemo = await dispatch({ type: 'applyDemo' });
  assert(editedDemo.task.changes.some(change => change.path === 'app.js'));
  assert.notEqual(editedDemo.task.revision, demoTask.baselineRevision);
  const demoJournal = 'Tutorial journal survives switching between chats.';
  await dispatch({ type: 'sendMessage', text: demoJournal });

  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
  await page.getByRole('combobox', { name: 'Task mode', exact: true }).selectOption('manual');
  await page.keyboard.press('Escape');
  const manualRequest = 'Inspect the tea filter and document its edge cases';
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).fill(manualRequest);
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  const manual = await untilState(value => !value.busy && value.task?.mode === 'manual' && value.task.request === manualRequest, 'Create manual chat through composer');
  assert.notEqual(manual.task.id, demoTask.id);
  assert.equal(manual.activeProject.id, demoTask.projectId);
  assert.equal(manual.task.baselineRevision, editedDemo.task.revision);
  assert.equal(manual.task.changes.length, 0);
  assert.equal(manual.task.planApproved, false);
  await page.getByRole('button', { name: 'Toggle review panel', exact: true }).click();
  await page.getByRole('button', { name: 'Approve plan', exact: true }).click();
  await untilState(value => !value.busy && value.task?.planApproved && value.task.runtimeComplete, 'Approve manual plan');
  const manualJournal = 'Manual journal belongs only to the inspection chat.';
  const composer = page.getByRole('textbox', { name: 'Message Muse', exact: true });
  await composer.fill(manualJournal);
  await composer.press('Control+Enter');
  await untilState(value => !value.busy && value.task?.messages.some(message => message.text === manualJournal), 'Default Ctrl+Enter sends a manual journal entry');
  const manualTask = { id: manual.task.id, title: manual.task.title, baselineRevision: manual.task.baselineRevision };
  record('Composer creates a real manual task while preserving the explicit plan gate');

  dialog = await settings();
  const enterToSend = dialog.getByRole('switch', { name: 'Enter to send', exact: true });
  assert.equal(await enterToSend.getAttribute('aria-checked'), 'false');
  await enterToSend.click();
  assert.equal(await enterToSend.getAttribute('aria-checked'), 'true');
  await closeDialog();
  const beforeKeyboardNote = (await state()).task.messages.length;
  await composer.fill('First keyboard line.');
  await composer.press('Shift+Enter');
  assert.equal(await composer.inputValue(), 'First keyboard line.\n');
  assert.equal((await state()).task.messages.length, beforeKeyboardNote, 'Shift+Enter must not submit');
  await composer.pressSequentially('Second keyboard line.');
  const keyboardJournal = 'First keyboard line.\nSecond keyboard line.';
  assert.equal(await composer.inputValue(), keyboardJournal);
  await composer.press('Enter');
  await untilState(value => !value.busy && value.task?.messages.some(message => message.text === keyboardJournal), 'Enter-to-send submits a multiline manual journal entry');
  // The controller publishes before the dispatch promise resolves and React
  // clears the composer. Wait for that observable UI completion separately.
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message Muse"]')?.value === '');
  assert.equal(await composer.inputValue(), '');
  dialog = await settings();
  await dialog.getByRole('switch', { name: 'Enter to send', exact: true }).click();
  assert.equal(await dialog.getByRole('switch', { name: 'Enter to send', exact: true }).getAttribute('aria-checked'), 'false');
  await closeDialog();
  record('Ctrl+Enter sends by default; Enter-to-send preserves Shift+Enter newlines and submits on Enter');

  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
  await page.getByRole('combobox', { name: 'Task mode', exact: true }).selectOption('muse');
  await page.keyboard.press('Escape');
  assert.equal((await state()).runtime.binary,null,'Offline test must not discover a real Muse binary');
  const unsentRequest = 'Explain how this project could be improved before changing files';
  await composer.fill(unsentRequest);
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  const unsentMuse = await untilState(value => !value.busy && value.task?.mode === 'muse' && value.task.request === unsentRequest, 'Create an unsent Muse task');
  assert.equal(unsentMuse.task.planApproved, false);
  assert.equal(unsentMuse.task.runtimeComplete, false);
  await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
  await page.getByRole('combobox', { name: 'Conversation mode', exact: true }).selectOption('plan');
  await page.keyboard.press('Escape');
  await page.getByText('Plan is guidance, not read-only. File and command tools remain available.', { exact: true }).waitFor();
  await composer.fill('This request must remain unsent.');
  assert(!(await page.getByRole('button', { name: 'Send message', exact: true }).isDisabled()));
  assert.equal((await state()).runtime.liveVerified, false);
  assert(!(await state()).runtime.sessionId);
  await selectSearchResult(manualTask.title, manualTask.id);
  record('Unsent Muse Plan mode explains that file and command tools remain available before sending');
  await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
  const manualConversationMode = page.getByRole('combobox', { name: 'Conversation mode', exact: true });
  assert.equal(await manualConversationMode.inputValue(), 'chat', 'Switching from a Muse plan to a manual task must reset the conversation mode');
  assert.equal(await manualConversationMode.locator('option:checked').innerText(), 'Notes');
  assert(await manualConversationMode.isDisabled(), 'Manual journal mode cannot expose Muse planning controls');
  await page.keyboard.press('Escape');
  record('Switching from Muse Plan mode to a manual task shows its local Notes mode');

  // The second workspace is ordinary source on disk, opened through the real
  // controller. No fake bridge snapshot or renderer-local history is injected.
  const secondRoot = path.join(projectsDir, 'second-project');
  await mkdir(secondRoot);
  await writeFile(path.join(secondRoot, 'package.json'), JSON.stringify({ name: 'redesign-second-project', private: true }, null, 2));
  await writeFile(path.join(secondRoot, 'index.js'), 'export const fixture = "second workspace";\n');
  await dispatch({ type: 'openProject', path: secondRoot });
  const other = await dispatch({ type: 'newTask', request: 'Review the second workspace entry point', mode: 'manual' });
  const otherTask = { id: other.task.id, title: other.task.title, projectId: other.activeProject.id };
  await dispatch({ type: 'sendMessage', text: 'Second workspace journal entry.' });
  assert.notEqual(otherTask.projectId, demoTask.projectId);

  // Record both input-preservation regressions independently in one run.
  // Neither test saves or approves the draft content.
  const regressionFailures = [];
  const savedOtherPlan = (await state()).task.plan;
  await page.getByRole('button', { name: 'Toggle review panel', exact: true }).click();
  try {
    const unsavedPlan = 'Unsaved review plan: preserve this exact draft while visiting Customize.';
    await page.getByRole('textbox', { name: 'Task plan', exact: true }).fill(unsavedPlan);
    await page.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Prompt starters', exact: true }).click();
    await page.getByRole('heading', { name: 'Prompt starters', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Task plan', exact: true }).inputValue(), unsavedPlan);
    assert.equal((await state()).task.plan, savedOtherPlan, 'Unsaved review draft must remain uncommitted');
    record('Customize and Home preserve an unsaved review-plan draft');
  } catch (error) {
    regressionFailures.push({ name: 'Unsaved review plan survives Customize', error: error.message });
    await shot('regression-unsaved-plan');
  }
  await page.getByRole('textbox', { name: 'Task plan', exact: true }).fill(savedOtherPlan);

  await selectSearchResult(manualTask.title, manualTask.id);
  try {
    const unsentDraft = 'Unsent composer draft: retain this request while choosing the second project.';
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await composer.fill(unsentDraft);
    // Stub only the OS file-picker response; the button, bridge, project
    // selection, controller and persisted task data all remain real.
    await app.evaluate(({ dialog }, folder) => {
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => {
        dialog.showOpenDialog = original;
        return { canceled: false, filePaths: [folder] };
      };
    }, secondRoot);
    await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
    await page.getByRole('button', { name: 'Choose project', exact: true }).click();
    await untilState(value => !value.busy && value.activeProject?.id === otherTask.projectId, 'Choose a known project for a composer draft');
    await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
    assert(await page.getByRole('combobox', { name: 'Task mode', exact: true }).isVisible(), 'Choosing a known project must keep the new-chat creation view');
    await page.keyboard.press('Escape');
    assert.equal(await composer.inputValue(), unsentDraft);
    assert(!(await state()).tasks.some(task => task.title === unsentDraft), 'Changing project must not submit the draft');
    record('Choosing a known project preserves the unsent composer and new-chat view');
  } catch (error) {
    regressionFailures.push({ name: 'Unsent composer survives choosing a known project', error: error.message });
    await shot('regression-unsent-composer');
  }
  report.regressionFailures = regressionFailures;
  assert.equal(regressionFailures.length, 0, JSON.stringify(regressionFailures, null, 2));

  await selectSearchResult(demoTask.title, demoTask.id);
  const restoredDemo = await state();
  assert.equal(restoredDemo.activeProject.id, demoTask.projectId);
  assert.equal(restoredDemo.task.baselineRevision, demoTask.baselineRevision);
  assert(restoredDemo.task.changes.some(change => change.path === 'app.js'));
  assert(restoredDemo.task.messages.some(message => message.text === demoJournal));
  assert(!restoredDemo.task.messages.some(message => message.text === manualJournal));
  assert.equal(restoredDemo.task.planApproved, true);
  await page.locator('.project-chats').getByRole('button', { name: manualTask.title, exact: false }).click();
  const restoredManual = await untilState(value => !value.busy && value.task?.id === manualTask.id, 'Select sibling chat');
  assert.equal(restoredManual.task.baselineRevision, manualTask.baselineRevision);
  assert.equal(restoredManual.task.changes.length, 0);
  assert(restoredManual.task.messages.some(message => message.text === manualJournal));
  assert(!restoredManual.task.messages.some(message => message.text === demoJournal));
  await selectSearchResult(otherTask.title, otherTask.id);
  assert.equal((await state()).activeProject.id, otherTask.projectId);
  await selectSearchResult(manualTask.title, manualTask.id);
  record('Ctrl+K focuses search; sidebar and search restore real chat IDs, baselines, journals, and owning projects');

  const reviewToggle = page.getByRole('button', { name: 'Toggle review panel', exact: true });
  const reviewInitial = await reviewToggle.getAttribute('aria-pressed');
  assert(['true', 'false'].includes(reviewInitial), 'Review toggle must expose its selected state');
  await reviewToggle.click();
  assert.equal(await reviewToggle.getAttribute('aria-pressed'), reviewInitial === 'true' ? 'false' : 'true');
  await reviewToggle.click();
  assert.equal(await reviewToggle.getAttribute('aria-pressed'), reviewInitial);
  await shot('workspace-1440');
  record('Review panel can be toggled without replacing the active chat');

  await page.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await page.getByRole('menuitem', { name: /Muse connection/ }).click();
  await page.getByRole('dialog', { name: 'Your Muse connection', exact: true }).waitFor();
  await closeDialog();
  const offline = await state();
  assert.equal(offline.runtime.liveVerified, false);
  assert(!offline.runtime.sessionId, 'Offline UI checks must not connect Muse');
  record('Existing runtime connection controls remain available without a model call');

  await reviewToggle.click(); // Explicitly open Review before testing its narrow layout.
  for (const width of [1280, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await assertNoOverflow(`${width}px workspace`);
    if (width !== 1440) await shot(`workspace-${width}`);
    if (width === 390) {
      await page.getByRole('button', { name: 'Toggle review panel', exact: true }).click();
      await page.getByRole('textbox', { name: 'Message Muse', exact: true }).waitFor();
      await assertNoOverflow('390px chat and composer');
      await shot('chat-390');
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.getByRole('button', { name: 'New chat', exact: true }).waitFor();
      await profile().click();await page.getByRole('menu',{name:'Your profile',exact:true}).waitFor();const menuBounds=await page.locator('.profile-popover').boundingBox();assert(menuBounds.x>=0&&menuBounds.y>=0&&menuBounds.x+menuBounds.width<=391);await shot('profile-narrow');await page.keyboard.press('Escape');
      await assertNoOverflow('390px navigation');
      // The scrim is behind the sidebar; use its exposed right-hand edge.
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 380, y: 400 } });
      await page.getByRole('button', { name: 'Toggle review panel', exact: true }).click();
    }
  }
  record('390px, 1280px, and 1440px layouts have no page overflow, including narrow chat and navigation');

  await app.close(); app = null;
  await openApp();
  await page.getByRole('button', { name: 'New chat', exact: true }).waitFor();
  const restarted = await untilState(value => value.task?.id === manualTask.id, 'Restore active chat after restart');
  assert.equal(restarted.activeProject.id, demoTask.projectId);
  assert(restarted.task.messages.some(message => message.text === manualJournal));
  assert.equal(restarted.task.planApproved, true);
  await selectSearchResult(otherTask.title, otherTask.id);
  assert((await state()).task.messages.some(message => message.text === 'Second workspace journal entry.'));
  await selectSearchResult(demoTask.title, demoTask.id);
  assert((await state()).task.messages.some(message => message.text === demoJournal));
  record('Restart preserves active chat and searchable history across both projects');
  assert.equal(report.errors.length, 0, `Renderer errors: ${report.errors.join('; ')}`);
  record('No renderer JavaScript errors during redesigned navigation and persistence workflows');
  report.status = 'passed';
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  if (page && !page.isClosed()) await shot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(error => report.errors.push(`Close: ${error.message}`));
  const serialized = JSON.stringify(report, null, 2);
  await writeFile(path.join(fixture, 'report.json'), serialized);
  await writeFile(path.join(artifacts, `redesign-ui${variant === 'packaged' ? '-packaged' : ''}-results.json`), serialized);
  console.log(`Report: ${path.join(fixture, 'report.json')}`);
}
