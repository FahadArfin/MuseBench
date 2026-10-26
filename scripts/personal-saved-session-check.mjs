import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

// Explicit maintenance check, run only after gracefully closing the normal app.
// Uses the existing profile in place. No cookie/token reads, copies, login form
// automation, chat messages, model requests, or WhatsApp pairing.
if (process.env.MUSEBENCH_VERIFY_SAVED_SESSION !== '1') throw Error('Set MUSEBENCH_VERIFY_SAVED_SESSION=1 for the explicit saved-session check.');
const root = process.cwd();
const output = path.join(root, 'artifacts', 'personal-saved-session');
await mkdir(output, { recursive: true });
const source = process.env.MUSEBENCH_SAVED_SOURCE === '1';
const report = { checkedAt: new Date().toISOString(), variant: source ? 'source' : 'packaged', modelRequests: 0, accountChanges: 0, checks: [] };
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
const app = await electron.launch({ ...(!source ? { executablePath: path.join(root, 'release/win-unpacked/MuseBench.exe') } : {}), args: source ? ['.'] : [], cwd: root, env });
const page = await app.firstWindow();
const record = name => { report.checks.push(name); console.log(`PASS ${name}`); };
async function checkRemote(expression) {
  return app.evaluate(async ({ BrowserWindow }, expression) => {
    const main = BrowserWindow.getAllWindows().find(window => !window.getParentWindow());
    const view = main.contentView.children.find(view => view.webContents && view.getVisible());
    if (!view || view.webContents.isDestroyed()) return null;
    let url;
    try { url = new URL(view.webContents.getURL()); } catch { return null; }
    if (url.origin !== 'https://muse.ai') return null;
    return view.webContents.executeJavaScript(expression);
  }, expression);
}
async function until(check, name) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    const state = await page.evaluate(() => window.musebench.personalState());
    if (state.error || state.notice) throw Error(state.error || state.notice);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error(`${name} was not available in the saved session.`);
}
try {
  await page.waitForFunction(() => Boolean(window.musebench));
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  await page.getByRole('navigation', { name: 'Meta AI navigation', exact: true }).getByRole('button', { name: 'Muse AI bot', exact: true }).click();
  await until(() => checkRemote(`Boolean(document.querySelector('[data-hatch-dock]') && document.querySelector('[data-hatch-full-page-shell]'))`), 'Signed-in Muse application shell');
  record('Existing Muse session opens its signed-in application shell');
  assert.equal(await checkRemote(`getComputedStyle(document.querySelector('[data-hatch-dock]')).display`), 'none');
  record('Integrated layout hides the real duplicate Muse dock');
  await page.getByRole('button', { name: 'Use integrated Muse layout', exact: true }).click();
  await until(async () => { const display = await checkRemote(`getComputedStyle(document.querySelector('[data-hatch-dock]')).display`); return Boolean(display && display !== 'none'); }, 'Original Muse layout');
  record('Original real Muse navigation can be restored');
  await page.getByRole('button', { name: 'Use integrated Muse layout', exact: true }).click();
  await page.getByRole('button', { name: 'Accounts and connections', exact: true }).click();
  await page.waitForFunction(async () => !(await window.musebench.personalState()).visible);
  // The native sidebar now contains private titles. Keep live proof to counts
  // and booleans; use isolated fixtures for visual captures.
  await page.getByRole('button', { name: 'Connect WhatsApp', exact: true }).click();
  await until(() => checkRemote(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(element => element.textContent.trim() === 'Messaging channels' && element.getAttribute('data-active') === 'true')`), 'Official Messaging channels settings');
  record('Native WhatsApp shortcut opens official Messaging channels without pairing');
  // Closing only the remote settings dialog leaves account permissions unchanged.
  await app.evaluate(async ({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => !window.getParentWindow());
    const view = main.contentView.children.find(view => view.webContents && view.getVisible());
    if (view && new URL(view.webContents.getURL()).origin === 'https://muse.ai') await view.webContents.executeJavaScript(`document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click()`);
  });
  assert.equal(await checkRemote(`typeof window.musebench === 'undefined' && typeof require === 'undefined' && typeof process === 'undefined'`), true);
  record('Real signed-in page has no local workspace bridge or Node access');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  const current = await page.evaluate(() => window.musebench.personalState()).catch(() => null);
  if (current) report.state = { destination: current.destination, loading: current.loading, error: Boolean(current.error), notice: Boolean(current.notice), authenticating: current.authenticating };
  report.controlDiagnostics = await checkRemote(`({settingsTrigger:!!document.querySelector('[data-testid="hatch-dock-more"]'),settingsExpanded:document.querySelector('[data-testid="hatch-dock-more"]')?.getAttribute('aria-expanded'),menuSettings:!!Array.from(document.querySelectorAll('[role="menuitem"]')).find(e=>e.textContent.trim().startsWith('Settings')),settingsDialog:!!Array.from(document.querySelectorAll('[role="dialog"] h2')).find(e=>e.textContent.trim()==='Settings'),messagingButton:!!Array.from(document.querySelectorAll('[role="dialog"] button')).find(e=>e.textContent.trim()==='Messaging channels')})`).catch(() => null);
  report.settingsSelection = await checkRemote(`Array.from(document.querySelectorAll('[role="dialog"] button')).filter(e=>['General','Connectors','Messaging channels'].includes(e.textContent.trim())).map(e=>({tab:e.textContent.trim(),active:e.getAttribute('data-active'),selected:e.getAttribute('aria-selected'),state:e.getAttribute('data-state')}))`).catch(()=>null);
}
finally { await app.close(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(`Report: ${path.join(output, 'report.json')}`); }
