import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const api = await import('../electron/work-export.mjs').catch(() => ({}));
const artifact = (overrides = {}) => ({ version: 1, kind: 'document', title: 'Quarterly report', summary: 'Local figures', sections: [{ heading: 'Result', body: 'Revenue is 42.' }], ...overrides });
const motion = () => artifact({ kind: 'motion', scenes: [{ title: 'One', body: 'First scene', duration: 2 }, { title: 'Two', body: 'Second scene', duration: 2 }] });
async function folder(t) { const root = await mkdtemp(path.join(os.tmpdir(), 'muse-export-test-')); t.after(() => rm(root, { recursive: true, force: true })); return root; }
function renderer({ pdfError, hanging = false } = {}) {
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.seeks = []; windows.push(this);
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        session: {
          webRequest: { onBeforeRequest: callback => { this.requestFilter = callback; } },
          setPermissionRequestHandler: callback => { this.permission = callback; },
          setPermissionCheckHandler: callback => { this.permissionCheck = callback; },
        },
        setWindowOpenHandler: callback => { this.popup = callback; },
        executeJavaScript: async script => { this.seeks.push(script); return true; },
        printToPDF: async () => { if (pdfError) throw Error(pdfError); return Buffer.from('%PDF-fixture'); },
        capturePage: async () => ({ getSize: () => ({ width: 1280, height: 720 }), toPNG: () => Buffer.from('PNG-fixture') }),
      });
    }
    async loadURL(url) { this.url = url; if (hanging) await new Promise(() => {}); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  return { Window, windows };
}
function encoder({ fail = false, hang = false } = {}) {
  const calls = [];
  const spawnProcess = (executable, args, options) => {
    const child = new EventEmitter(); child.stderr = new EventEmitter(); child.killed = false;
    const call = { executable, args, options, child, frames: [] }; calls.push(call);
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', null, 'SIGTERM')); return true; };
    child.stdin = new Writable({ write(chunk, _encoding, done) { call.frames.push(Buffer.from(chunk)); done(); } });
    child.stdin.once('finish', async () => {
      await writeFile(args.at(-1), fail ? 'partial video' : 'MP4-fixture');
      if (fail) child.stderr.emit('data', Buffer.from('encoder unavailable'));
      if (!hang) child.emit('close', fail ? 1 : 0, null);
    });
    return child;
  };
  return { spawnProcess, calls };
}

test('text exports validate data and replace only the selected destination', async t => {
  assert.equal(typeof api.createWorkExporter, 'function');
  const root = await folder(t); const exporter = api.createWorkExporter({ ffmpegPath: null }); t.after(() => exporter.close());
  const filePath = path.join(root, 'selected.json'); await writeFile(filePath, 'old');
  assert.deepEqual(await exporter.export({ artifact: artifact({ script: 'evil()' }), format: 'json', filePath }), { saved: true, path: filePath });
  const json = JSON.parse(await readFile(filePath, 'utf8')); assert.equal(json.title, 'Quarterly report'); assert.equal(json.script, undefined);
  await assert.rejects(exporter.export({ artifact: artifact({ title: '' }), format: 'json', filePath }));
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).title, 'Quarterly report');
  assert.deepEqual(await readdir(root), ['selected.json']);
});

test('HTML, Markdown and CSV export content and preserve formula safety', async t => {
  const root = await folder(t); const exporter = api.createWorkExporter({ ffmpegPath: null }); t.after(() => exporter.close());
  for (const format of ['html', 'md', 'csv']) {
    const filePath = path.join(root, `report.${format}`);
    await exporter.export({ artifact: artifact({ table: { columns: ['Name'], rows: [['=BAD()']] } }), format, filePath });
    const content = await readFile(filePath, 'utf8');
    if (format === 'html') { assert.match(content, /Content-Security-Policy/); assert.match(content, /Quarterly report/); }
    if (format === 'md') assert.match(content, /Revenue is 42/);
    if (format === 'csv') assert.match(content, /'=BAD\(\)/);
  }
});

test('invalid formats, relative destinations and non-Motion video fail before changing files', async t => {
  const root = await folder(t); const filePath = path.join(root, 'saved.mp4'); await writeFile(filePath, 'original');
  const exporter = api.createWorkExporter({ ffmpegPath: null }); t.after(() => exporter.close());
  await assert.rejects(exporter.export({ artifact: artifact(), format: 'exe', filePath }), /format/i);
  await assert.rejects(exporter.export({ artifact: artifact(), format: 'json', filePath: 'relative.json' }), /absolute|destination/i);
  await assert.rejects(exporter.export({ artifact: artifact(), format: 'mp4', filePath }), /motion/i);
  await assert.rejects(exporter.export({ artifact: motion(), format: 'mp4', filePath }), /FFmpeg.*install|install.*FFmpeg/i);
  assert.deepEqual(await exporter.capabilities(), { mp4: false });
  assert.equal(await readFile(filePath, 'utf8'), 'original'); assert.deepEqual(await readdir(root), ['saved.mp4']);
});

test('PDF uses a hidden isolated renderer and denies network, navigation, permissions and popups', async t => {
  const root = await folder(t); const { Window, windows } = renderer();
  const exporter = api.createWorkExporter({ BrowserWindow: Window, ffmpegPath: null }); t.after(() => exporter.close());
  const filePath = path.join(root, 'report.pdf'); await exporter.export({ artifact: artifact(), format: 'pdf', filePath });
  assert.equal(await readFile(filePath, 'utf8'), '%PDF-fixture');
  const win = windows[0]; assert.equal(win.options.show, false); assert.equal(win.options.webPreferences.sandbox, true); assert.equal(win.options.webPreferences.nodeIntegration, false); assert.equal(win.options.webPreferences.contextIsolation, true); assert.equal(win.options.webPreferences.preload, undefined); assert(!win.options.webPreferences.partition.startsWith('persist:'));
  assert.deepEqual(win.popup({ url: 'https://evil.invalid' }), { action: 'deny' });
  for (const url of ['https://evil.invalid', 'file:///secret', 'musebench://main']) {
    let result; win.requestFilter({ url }, value => { result = value; }); assert.deepEqual(result, { cancel: true });
  }
  let permitted; win.permission(null, 'camera', value => { permitted = value; }); assert.equal(permitted, false); assert.equal(win.permissionCheck(), false);
  for (const event of ['will-navigate', 'will-redirect', 'will-attach-webview']) { let prevented = false; win.webContents.emit(event, { preventDefault: () => { prevented = true; } }); assert(prevented); }
  assert(win.destroyed); assert.match(decodeURIComponent(win.url), /Content-Security-Policy/);
});

test('renderer failure preserves existing destination and removes temporary output', async t => {
  const root = await folder(t); const filePath = path.join(root, 'report.pdf'); await writeFile(filePath, 'original');
  const { Window, windows } = renderer({ pdfError: 'printing failed' });
  const exporter = api.createWorkExporter({ BrowserWindow: Window, ffmpegPath: null }); t.after(() => exporter.close());
  await assert.rejects(exporter.export({ artifact: artifact(), format: 'pdf', filePath }), /printing failed/);
  assert.equal(await readFile(filePath, 'utf8'), 'original'); assert.deepEqual(await readdir(root), ['report.pdf']); assert(windows[0].destroyed);
});

test('Motion video captures deterministic bounded frames and invokes FFmpeg without a shell', async t => {
  const root = await folder(t); const { Window, windows } = renderer(); const { spawnProcess, calls } = encoder();
  const exporter = api.createWorkExporter({ BrowserWindow: Window, ffmpegPath: path.join(root, 'ffmpeg.exe'), spawnProcess }); t.after(() => exporter.close());
  const filePath = path.join(root, 'motion.mp4'); await exporter.export({ artifact: motion(), format: 'mp4', filePath });
  assert.equal(await readFile(filePath, 'utf8'), 'MP4-fixture'); assert.equal(calls.length, 1); assert.equal(calls[0].frames.length, 48);
  assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.windowsHide, true); assert(calls[0].args.includes('image2pipe')); assert(calls[0].args.includes('scale=1280:720'));
  const seeks = windows[0].seeks.filter(script => /museMotion\.seek\(/.test(script)); assert.equal(seeks.length, 48); assert.match(seeks[0], /seek\(0\)/); assert.match(seeks.at(-1), /seek\(3\.9166666666666665\)/); assert(windows[0].destroyed);
  assert.deepEqual(await readdir(root), ['motion.mp4']);
});

test('failed FFmpeg preserves the selected destination and cleans partial files', async t => {
  const root = await folder(t); const { Window, windows } = renderer(); const { spawnProcess } = encoder({ fail: true });
  const exporter = api.createWorkExporter({ BrowserWindow: Window, ffmpegPath: path.join(root, 'ffmpeg.exe'), spawnProcess }); t.after(() => exporter.close());
  const filePath = path.join(root, 'motion.mp4'); await writeFile(filePath, 'original');
  await assert.rejects(exporter.export({ artifact: motion(), format: 'mp4', filePath }), /FFmpeg|encoder/);
  assert.equal(await readFile(filePath, 'utf8'), 'original'); assert.deepEqual(await readdir(root), ['motion.mp4']); assert(windows[0].destroyed);
});

test('timeout closes a hung renderer, preserves destination and cleans temporary files', async t => {
  const root = await folder(t); const { Window, windows } = renderer({ hanging: true });
  const exporter = api.createWorkExporter({ BrowserWindow: Window, ffmpegPath: null, timeoutMs: 40 }); t.after(() => exporter.close());
  const filePath = path.join(root, 'report.pdf'); await writeFile(filePath, 'original');
  await assert.rejects(exporter.export({ artifact: artifact(), format: 'pdf', filePath }), /timed out/i);
  assert(windows[0].destroyed); assert.equal(await readFile(filePath, 'utf8'), 'original'); assert.deepEqual(await readdir(root), ['report.pdf']);
});

test('closing the exporter cancels FFmpeg and rejects future exports', async t => {
  const root = await folder(t); const { Window, windows } = renderer(); const { spawnProcess, calls } = encoder({ hang: true });
  const exporter = api.createWorkExporter({ BrowserWindow: Window, ffmpegPath: path.join(root, 'ffmpeg.exe'), spawnProcess });
  const filePath = path.join(root, 'motion.mp4');
  const outcome = exporter.export({ artifact: motion(), format: 'mp4', filePath }).then(() => null, error => error);
  while (!calls[0]?.frames.length) await new Promise(resolve => setTimeout(resolve, 1));
  await exporter.close(); assert.match((await outcome).message, /cancel|closed/i); assert(calls[0].child.killed); assert(windows[0].destroyed);
  assert.deepEqual(await readdir(root), []); await assert.rejects(exporter.export({ artifact: artifact(), format: 'json', filePath }), /closed/i);
});
