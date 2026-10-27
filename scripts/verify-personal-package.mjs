import * as asar from '@electron/asar';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd(), archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
function visit(relative) {
  for (const name of readdirSync(path.join(root, relative))) {
    const file = `${relative}/${name}`;
    if (statSync(path.join(root, file)).isDirectory()) visit(file);
    else files.push(file);
  }
}
for (const dir of ['electron', 'dist', 'src/controller', 'src/runtime', 'src/work', 'src/spaces', 'src/sites', 'templates']) visit(dir);
for (const name of readdirSync(path.join(root, 'reference/patchlight/adapter'))) if (name.endsWith('.mjs')) files.push(`reference/patchlight/adapter/${name}`);
for (const name of readdirSync(path.join(root, 'src/shared'))) if (name.endsWith('.mjs')) files.push(`src/shared/${name}`);
const checked = files.map(file => {
  const source = readFileSync(path.join(root, file));
  const packaged = asar.extractFile(archive, path.normalize(file));
  assert(source.equals(packaged), `${file} differs in the packaged application`);
  return { file, sha256: sha(source) };
});
const nativeHelpers = {};
for (const helper of ['MuseBenchJob', 'MuseBenchSpeech']) {
  for (const suffix of ['.exe', '.build.json']) {
    const name = helper + suffix;
    assert(readFileSync(path.join(root, 'native/bin', name)).equals(readFileSync(path.join(root, 'release/win-unpacked/resources/native', name))));
  }
  nativeHelpers[helper] = sha(readFileSync(path.join(root, 'native/bin', helper + '.exe')));
}
const report = { checkedAt: new Date().toISOString(), status: 'passed', files: checked, executableSha256: sha(readFileSync(path.join(root, 'release/win-unpacked/MuseBench.exe'))), archiveSha256: sha(readFileSync(archive)), nativeHelpers };
writeFileSync(path.join(root, 'artifacts/personal-package-verification.json'), JSON.stringify(report, null, 2));
console.log(`PASS ${checked.length} packaged source/build files and both native helpers match the validated source`);
