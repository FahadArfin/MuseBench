import * as asar from '@electron/asar';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd(), packageDir = process.env.MUSEBENCH_PACKAGE_DIR || path.join(root, 'release/win-unpacked');
const archive = path.join(packageDir, 'resources/app.asar');
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
// Embedded Muse views load fonts from production packages, while the local
// renderer uses Vite's dist assets. Verify both paths survive packaging intact.
for (const family of ['inter', 'jetbrains-mono']) {
  const directory = `node_modules/@fontsource-variable/${family}`;
  files.push(`${directory}/LICENSE`);
  // electron-builder removes descriptive keywords from dependency metadata.
  // Runtime resolution still needs the original package identity and exports.
  const metadataFile = `${directory}/package.json`;
  const sourceMetadata = JSON.parse(readFileSync(path.join(root, metadataFile), 'utf8'));
  const packagedMetadata = JSON.parse(asar.extractFile(archive, path.normalize(metadataFile)).toString());
  for (const key of ['name', 'version', 'main', 'exports', 'license']) assert.deepEqual(packagedMetadata[key], sourceMetadata[key], `${metadataFile} changed ${key}`);
  for (const stylesheet of ['index.css', 'wght-italic.css']) {
    files.push(`${directory}/${stylesheet}`);
    const css = readFileSync(path.join(root, directory, stylesheet), 'utf8');
    for (const [,font] of css.matchAll(/url\(\.\/files\/([a-z0-9-]+\.woff2)\)/g)) files.push(`${directory}/files/${font}`);
  }
}
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
    assert(readFileSync(path.join(root, 'native/bin', name)).equals(readFileSync(path.join(packageDir, 'resources/native', name))));
  }
  nativeHelpers[helper] = sha(readFileSync(path.join(root, 'native/bin', helper + '.exe')));
}
const report = { checkedAt: new Date().toISOString(), status: 'passed', files: checked, executableSha256: sha(readFileSync(path.join(packageDir, 'MuseBench.exe'))), archiveSha256: sha(readFileSync(archive)), nativeHelpers };
writeFileSync(path.join(root, 'artifacts/personal-package-verification.json'), JSON.stringify(report, null, 2));
console.log(`PASS ${checked.length} packaged source/build files and both native helpers match the validated source`);
