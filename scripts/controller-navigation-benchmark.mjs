// Isolated controller + filesystem measurement; never reads the user's app database.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createController } from '../src/controller/index.mjs';

const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw Error('Use a short filename-safe benchmark label.');
const artifacts = path.resolve(import.meta.dirname, '../artifacts/controller-navigation-benchmark');
await fs.mkdir(artifacts, { recursive: true });
const root = await fs.mkdtemp(path.join(artifacts, 'fixture-'));
const results = [];
for (const files of [0, 100, 500]) {
  const folder = path.join(root, String(files)), project = path.join(folder, 'project');
  await fs.mkdir(project, { recursive: true });
  for (let i = 0; i < files; i++) {
    const sub = path.join(project, 'src', String(Math.floor(i / 50)));
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, `source-${i}.js`), `export const value = ${JSON.stringify('x'.repeat(100))};\n`);
  }
  const c = await createController({ dataDir: path.join(folder, 'data') });
  try {
    const act = async action => { const state = await c.dispatch(action); if (state.error) throw Error(state.error); return state; };
    await act({ type: 'openProject', path: project });
    const ids = [];
    for (const title of ['First', 'Second']) ids.push((await act({ type: 'newTask', request: title, mode: 'manual' })).task.id);
    await act({ type: 'selectTask', id: ids[0] });
    const samples = [];
    for (let i = 0; i < 5; i++) {
      let sourceOpens = 0;
      const original = fs.open;
      fs.open = async function(file, ...args) { if (String(file).startsWith(project + path.sep)) sourceOpens++; return original.call(this, file, ...args); };
      try {
        const start = performance.now();
        await act({ type: 'selectTask', id: ids[(i + 1) % 2] });
        samples.push({ elapsedMs: +(performance.now() - start).toFixed(2), sourceOpens });
      } finally { fs.open = original; }
    }
    const sorted = samples.map(s => s.elapsedMs).sort((a, b) => a - b);
    results.push({ files, medianMs: sorted[2], maxMs: sorted[4], samples });
  } finally { await c.close(); }
}
const result = { label, node: process.version, platform: process.platform, fixture: root, results };
await fs.writeFile(path.join(artifacts, `${label}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
