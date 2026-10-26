import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { artifactCsv, artifactMarkdown, renderArtifactHtml, validateArtifact } from '../src/shared/work-artifacts.mjs';

const executeFile = promisify(execFile);
const formats = new Set(['html', 'json', 'md', 'csv', 'pdf', 'mp4']);
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 12;

async function installedFFmpeg() {
  try {
    const { stdout } = await executeFile(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 32768 });
    for (const candidate of stdout.split(/\r?\n/).map(line => line.trim()).filter(line => path.isAbsolute(line))) {
      try {
        const result = await executeFile(candidate, ['-version'], { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 32768 });
        if (/^ffmpeg version /m.test(result.stdout)) return candidate;
      } catch { /* Try another installed executable, if present. */ }
    }
  } catch { /* FFmpeg is optional. */ }
  return null;
}

function createJob(timeoutMs) {
  let rejectAbort;
  const aborted = new Promise((_resolve, reject) => { rejectAbort = reject; });
  // An abort can arrive between awaited operations. Keep its rejection handled.
  aborted.catch(() => {});
  const job = {
    error: null, window: null, child: null, childDone: null, cleaning: false, tempPath: null, done: null,
    check() { if (this.error) throw this.error; },
    wait(promise) { this.check(); return Promise.race([promise, aborted]); },
    abort(error) {
      if (this.error || this.cleaning) return;
      this.error = error; rejectAbort(error);
      if (this.child) this.child.kill('SIGKILL');
      if (this.window && !this.window.isDestroyed()) this.window.destroy();
    },
  };
  job.timer = setTimeout(() => job.abort(Error('Work export timed out. Try a shorter or smaller artifact.')), timeoutMs);
  return job;
}

async function cleanup(job) {
  job.cleaning = true;
  clearTimeout(job.timer);
  if (job.child) {
    job.child.kill('SIGKILL');
    if (job.childDone) {
      let timer;
      await Promise.race([job.childDone.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 1500); })]);
      clearTimeout(timer);
    }
  }
  if (job.window && !job.window.isDestroyed()) job.window.destroy();
  if (job.tempPath) await rm(job.tempPath, { force: true });
}

async function hiddenRenderer(job, BrowserWindow, artifact, options) {
  if (typeof BrowserWindow !== 'function') throw Error('The Electron renderer is unavailable for this export.');
  const html = renderArtifactHtml(artifact, options);
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const win = new BrowserWindow({
    show: false, width: WIDTH, height: HEIGHT, useContentSize: true,
    webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, plugins: false,
      webviewTag: false, backgroundThrottling: false,
      offscreen: { deviceScaleFactor: 1 }, partition: `work-export-${randomUUID()}`,
    },
  });
  job.window = win;
  const web = win.webContents;
  web.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-redirect', 'will-attach-webview']) web.on(event, event => event.preventDefault());
  web.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  web.session.setPermissionCheckHandler(() => false);
  web.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== url }));
  web.on('render-process-gone', () => job.abort(Error('The Work export renderer stopped unexpectedly.')));
  win.on('closed', () => job.abort(Error('Work export was cancelled.')));
  await job.wait(win.loadURL(url));
  await job.wait(web.executeJavaScript('(async()=>{await document.fonts.ready;return true;})()'));
  return web;
}

async function renderVideo(job, web, ffmpeg, spawnProcess, artifact) {
  const duration = artifact.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw Error('Motion export duration must be at most 120 seconds.');
  const count = Math.ceil(duration * FPS);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(FPS), '-i', 'pipe:0',
    '-an', '-vf', `scale=${WIDTH}:${HEIGHT}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-frames:v', String(count), '-movflags', '+faststart', '-f', 'mp4', job.tempPath,
  ];
  const child = spawnProcess(ffmpeg, args, { windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe'] });
  job.child = child;
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
  job.childDone = new Promise((resolve, reject) => {
    child.once('error', () => reject(Error('FFmpeg could not start. Check that FFmpeg is installed and available.')));
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(Error(`FFmpeg video export failed${signal ? ` (${signal})` : ''}${diagnostic ? `: ${diagnostic.trim()}` : '.'}`)));
  });
  job.childDone.catch(error => job.abort(error));
  child.stdin.on('error', () => job.abort(Error('FFmpeg stopped accepting video frames.')));
  for (let frame = 0; frame < count; frame++) {
    job.check();
    const seconds = frame / FPS;
    // This fixed script contains only a bounded number. Artifact data never becomes code.
    await job.wait(web.executeJavaScript(`(async()=>{window.museMotion.seek(${seconds});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})()`));
    let image = await job.wait(web.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, { stayHidden: true, stayAwake: true }));
    const size = image.getSize();
    if (size.width !== WIDTH || size.height !== HEIGHT) image = image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' });
    await job.wait(new Promise((resolve, reject) => child.stdin.write(image.toPNG(), error => error ? reject(error) : resolve())));
  }
  child.stdin.end();
  await job.wait(job.childDone);
  job.child = null;
}

/**
 * Only main-process native save-dialog destinations may be passed to export().
 * This module has no IPC handlers and never loads a model-generated HTML file.
 * ffmpegPath is an optional trusted executable override (null disables MP4).
 */
export function createWorkExporter({ BrowserWindow, ffmpegPath, spawnProcess = spawn, timeoutMs = 300000 } = {}) {
  let closed = false;
  let ffmpegPromise;
  const jobs = new Set();
  const resolveFFmpeg = () => ffmpegPromise ??= ffmpegPath === undefined ? installedFFmpeg() : Promise.resolve(ffmpegPath);
  const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 300000) : 300000;

  async function run(job, { artifact: input, format, filePath, theme, updatedAt }) {
    try {
      if (!formats.has(format)) throw Error('Unsupported Work export format.');
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.includes('\0')) throw Error('An absolute native-selected export destination is required.');
      const artifact = validateArtifact(input);
      if (format === 'mp4' && artifact.kind !== 'motion') throw Error('MP4 export is available only for Motion artifacts.');
      const ffmpeg = format === 'mp4' ? await job.wait(resolveFFmpeg()) : null;
      if (format === 'mp4' && !ffmpeg) throw Error('Install FFmpeg and restart MuseBench to enable MP4 export.');
      const destination = await lstat(filePath).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      if (destination && !destination.isFile()) throw Error('The selected export destination must be a regular file.');
      job.check();
      const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
      const handle = await open(tempPath, 'wx', 0o600);
      job.tempPath = tempPath;
      await handle.close();
      job.check();
      const options = { theme: theme === 'light' ? 'light' : 'dark', updatedAt, exportMode: format === 'mp4', width: WIDTH, height: HEIGHT };
      if (format === 'json') await writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      else if (format === 'html') await writeFile(tempPath, renderArtifactHtml(artifact, options), 'utf8');
      else if (format === 'md') await writeFile(tempPath, artifactMarkdown(artifact), 'utf8');
      else if (format === 'csv') await writeFile(tempPath, artifactCsv(artifact), 'utf8');
      else {
        const web = await hiddenRenderer(job, BrowserWindow, artifact, options);
        if (format === 'pdf') {
          await job.wait(web.executeJavaScript('(()=>{for(const details of document.querySelectorAll("details"))details.open=true;return true;})()'));
          const pdf = await job.wait(web.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4', landscape: artifact.kind === 'slides' || artifact.kind === 'motion', margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 } }));
          await writeFile(tempPath, pdf);
        } else await renderVideo(job, web, ffmpeg, spawnProcess, artifact);
      }
      job.check();
      if ((await stat(tempPath)).size === 0) throw Error('Work export produced an empty file.');
      job.check();
      // Same-directory rename replaces the one selected file only after success.
      await rename(tempPath, filePath);
      job.tempPath = null;
      return { saved: true, path: filePath };
    } finally { await cleanup(job); }
  }

  return {
    async capabilities() { return { mp4: Boolean(await resolveFFmpeg()) }; },
    async export(options) {
      if (closed) throw Error('The Work exporter is closed.');
      if (jobs.size) throw Error('Another Work export is already running.');
      const job = createJob(boundedTimeout);
      jobs.add(job);
      job.done = run(job, options).finally(() => jobs.delete(job));
      return job.done;
    },
    async close() {
      closed = true;
      for (const job of jobs) job.abort(Error('Work export was cancelled because the exporter closed.'));
      await Promise.allSettled([...jobs].map(job => job.done));
    },
  };
}
