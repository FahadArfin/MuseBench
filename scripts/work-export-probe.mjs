import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Runs a standalone Electron main module, never the MuseBench application.
// Its Chromium storage and all generated samples stay in one isolated fixture.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executeFile = promisify(execFile);

if (!process.versions.electron) {
  const output = path.join(root, 'artifacts', 'work-exports');
  await mkdir(output, { recursive: true });
  const fixture = await mkdtemp(path.join(output, 'probe-'));
  const { default: electronPath } = await import('electron');
  const env = { ...process.env, MUSEBENCH_EXPORT_PROBE_DIR: fixture };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath, [fileURLToPath(import.meta.url), `--user-data-dir=${path.join(fixture, 'chromium')}`], { cwd: root, env, windowsHide: true, shell: false, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  clearTimeout(timer);
  assert.equal(code, 0, 'Isolated export runtime probe failed');
  console.log(`Export probe report: ${path.join(fixture, 'report.json')}`);
} else {
  const { app, BrowserWindow } = await import('electron');
  const { createWorkExporter } = await import('../electron/work-export.mjs');
  const fixture = process.env.MUSEBENCH_EXPORT_PROBE_DIR;
  assert(fixture && path.isAbsolute(fixture), 'Isolated fixture directory required');
  await mkdir(path.join(fixture, 'chromium'), { recursive: true });
  app.setPath('userData', path.join(fixture, 'chromium'));
  app.on('window-all-closed', () => {});
  const report = { startedAt: new Date().toISOString(), fixture, modelRequests: 0, checks: [] };
  class VerifiedWindow extends BrowserWindow {
    constructor(options) {
      super(options);
      const print = this.webContents.printToPDF.bind(this.webContents);
      this.webContents.printToPDF = async options => {
        const disclosureState = await this.webContents.executeJavaScript('Array.from(document.querySelectorAll("details"),element=>element.open)');
        assert(disclosureState.length > 0 && disclosureState.every(Boolean), 'PDF must print expanded source and calculation details');
        return print(options);
      };
    }
  }
  const exporter = createWorkExporter({ BrowserWindow: VerifiedWindow, timeoutMs: 90000 });
  // The ESM entry must finish loading before Electron emits ready.
  app.whenReady().then(async () => {
   try {
    const document = {
      version: 1, kind: 'document', title: 'Quarterly review — fictional sample',
      summary: 'An isolated local export check. All figures are fictional.',
      sources: [{ name: 'Fictional sample data', detail: 'No customer data and no model request.' }],
      metrics: [{ label: 'Revenue', value: '$42,000', change: '+12%', detail: 'Fictional figure for export validation.' }],
      charts: [{ title: 'Monthly revenue', type: 'bar', labels: ['Jul', 'Aug', 'Sep'], values: [10000, 14000, 18000], unit: 'USD', calculation: 'Sum the three monthly totals: $42,000.', source: 'Fictional sample data' }],
      sections: [{ heading: 'Executive summary', body: 'Revenue increased each month in this fictional quarter. The export should preserve readable text, chart geometry, and source attribution.' }],
    };
    const pdfPath = path.join(fixture, 'sample-report.pdf');
    await exporter.export({ artifact: document, format: 'pdf', filePath: pdfPath, theme: 'light' });
    const pdf = await readFile(pdfPath);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert(pdf.length > 10000);
    report.checks.push({ name: 'Sandboxed Electron PDF export', bytes: pdf.length, path: pdfPath });
    const capabilities = await exporter.capabilities();
    report.capabilities = capabilities;
    if (capabilities.mp4) {
      const motion = {
        ...document, kind: 'motion', title: 'A clearer quarter — fictional sample',
        scenes: [
          { kicker: '01 · The starting point', title: 'Make the numbers clear', body: 'A fictional quarter begins at $10,000.', duration: 2 },
          { kicker: '02 · The next step', title: 'Turn insight into action', body: 'Three monthly totals add up to $42,000.', duration: 2 },
        ],
      };
      const mp4Path = path.join(fixture, 'sample-motion.mp4');
      await exporter.export({ artifact: motion, format: 'mp4', filePath: mp4Path, theme: 'dark' });
      assert((await stat(mp4Path)).size > 10000);
      const find = async name => (await executeFile(process.platform === 'win32' ? 'where.exe' : 'which', [name], { windowsHide: true, shell: false, timeout: 5000 })).stdout.trim().split(/\r?\n/)[0];
      const ffprobe = await find('ffprobe');
      const metadata = JSON.parse((await executeFile(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4Path], { windowsHide: true, shell: false, timeout: 10000 })).stdout);
      const stream = metadata.streams.find(item => item.codec_type === 'video');
      assert.equal(stream.codec_name, 'h264'); assert.equal(stream.width, 1280); assert.equal(stream.height, 720); assert.equal(stream.nb_frames, '48'); assert.equal(Number(metadata.format.duration), 4);
      const ffmpeg = await find('ffmpeg');
      for (const [label, second] of [['first', '1'], ['second', '3']]) {
        await executeFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', second, '-i', mp4Path, '-frames:v', '1', path.join(fixture, `${label}-scene.png`)], { windowsHide: true, shell: false, timeout: 10000 });
      }
      assert.notDeepEqual(await readFile(path.join(fixture, 'first-scene.png')), await readFile(path.join(fixture, 'second-scene.png')), 'The video must advance between its two scenes');
      report.checks.push({ name: 'Deterministic Motion MP4 export', path: mp4Path, width: stream.width, height: stream.height, frames: Number(stream.nb_frames), duration: Number(metadata.format.duration), codec: stream.codec_name });
    }
    assert(!(await readdir(fixture)).some(name => name.endsWith('.tmp')));
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    report.checks.push({ name: 'All temporary export files and renderers cleaned up' });
    report.status = 'passed';
   } catch (error) {
    report.status = 'failed'; report.error = error.stack; console.error(error);
   } finally {
    await exporter.close();
    report.completedAt = new Date().toISOString();
    await writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    app.exit(report.status === 'passed' ? 0 : 1);
   }
  });
}
