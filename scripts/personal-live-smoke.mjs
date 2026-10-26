import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Public, signed-out website loading only. No cookie imports, credentials,
// messages, account actions, or protocol/network fixtures.
const root = process.cwd();
await mkdir(path.join(root, 'artifacts', 'personal-live'), { recursive: true });
const source = process.env.MUSEBENCH_LIVE_SOURCE === '1';
const output = await mkdtemp(path.join(root, 'artifacts', 'personal-live', source ? 'source-' : 'packaged-'));
const env = { ...process.env, MUSEBENCH_DATA_DIR: path.join(output, 'data'), MUSEBENCH_PROJECTS_DIR: path.join(output, 'projects') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.MUSEBENCH_DEV;
const app = await electron.launch({ ...(source ? { args: ['.'] } : { executablePath: path.join(root, 'release', 'win-unpacked', 'MuseBench.exe'), args: [] }), cwd: root, env });
const report = { startedAt: new Date().toISOString(), authenticated: false, modelRequests: 0, checks: [], errors: [] };
try {
  const page = await app.firstWindow();
  await app.evaluate(({ app }) => {
    globalThis.__personalNavigationDiagnostics = [];
    app.on('web-contents-created', (_event, contents) => {
      for (const name of ['did-start-navigation', 'will-redirect', 'did-navigate']) contents.on(name, (event, url) => {
        try { globalThis.__personalNavigationDiagnostics.push({ event: name, origin: new URL(event.url ?? url).origin }); } catch { /* No credential-bearing strings. */ }
      });
      contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame) globalThis.__personalNavigationDiagnostics.push({ event: 'did-fail-load', code }); });
    });
  });
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  for (const destination of ['chat', 'bot', 'ideas', 'goals']) {
    await page.evaluate(destination => window.musebench.personal({ type: 'navigate', destination }), destination);
    const deadline = Date.now() + 25000;
    while (!await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const view = win.contentView.children.find(view => view.webContents && view.webContents !== win.webContents && view.getVisible());
      if (!view?.webContents.getURL().startsWith('https://')) return false;
      try { return await view.webContents.executeJavaScript(`document.readyState !== 'loading' && document.querySelectorAll('input,textarea,[contenteditable=true]').length > 0`); } catch { return false; }
    })) {
      const current = await page.evaluate(() => window.musebench.personalState());
      if (current.error) throw Error(`${destination}: ${current.error}`);
      if (Date.now() > deadline) throw Error(`${destination} did not reach its public entry page`);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const state = await page.evaluate(() => window.musebench.personalState());
    assert.equal(state.error, null, `${destination}: ${state.error}`);
    assert.equal(state.visible, true, `${destination} view should be visible`);
    const evidence = await app.evaluate(async ({ BrowserWindow }, destination) => {
      const win = BrowserWindow.getAllWindows()[0];
      const entry = win.contentView.children.find(view => view.webContents && view.webContents !== win.webContents && view.getVisible());
      const contents = entry.webContents;
      // Only sanitized page metadata and signed-out entry-page counts.
      const url = new URL(contents.getURL());
      const dom = await contents.executeJavaScript(`({ title: document.title, forms: document.querySelectorAll('input,textarea,[contenteditable=true]').length, headings: Array.from(document.querySelectorAll('h1,h2')).slice(0,4).map(e=>e.textContent), bridge: typeof window.musebench, node: typeof window.require })`);
      return { destination, origin: url.origin, path: url.pathname, ...dom };
    }, destination);
    assert.equal(evidence.bridge, 'undefined');
    assert.equal(evidence.node, 'undefined');
    assert(evidence.forms > 0, `${destination} should render a sign-in or chat entry form`);
    report.checks.push(evidence);
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`PASS real official ${destination} entry loads in sandboxed ${source ? 'source' : 'packaged'} view`);
  }
} catch (error) {
  report.errors.push(String(error));
  report.navigation = await app.evaluate(() => globalThis.__personalNavigationDiagnostics);
  report.lastState = await (await app.firstWindow()).evaluate(() => window.musebench.personalState());
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  const diagnostics = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return Promise.all(win.contentView.children.filter(view => view.webContents && view.webContents !== win.webContents).map(async view => {
      const contents = view.webContents;
      const url = contents.getURL();
      const safe = url.startsWith('https://') ? new URL(url).origin : 'uncommitted';
      return { origin: safe, visible: view.getVisible(), loading: contents.isLoadingMainFrame() };
    }));
  });
  report.diagnostics = diagnostics;
  report.navigation = await app.evaluate(() => globalThis.__personalNavigationDiagnostics);
  report.lastState = await (await app.firstWindow()).evaluate(() => window.musebench.personalState());
  process.exitCode = 1;
} finally {
  await app.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Report: ${output}/report.json`);
}
