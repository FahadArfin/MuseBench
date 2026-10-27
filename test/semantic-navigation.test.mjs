import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const implementation = await import('../src/controller/semantic-navigation.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
async function fixture(t, files, limits) {
  assert.equal(typeof implementation.createSemanticNavigation, 'function', 'bounded semantic navigation must be implemented');
  const root = await mkdtemp(path.join(os.tmpdir(), 'muse-semantic-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), {recursive: true});
    await writeFile(path.join(root, name), text);
  }
  const service = implementation.createSemanticNavigation(root, {limits});
  t.after(() => service.dispose());
  return {root, service};
}
const source = {
  'lib.ts': '/** Add two values. */\nexport function add(a: number, b: number) { return a + b; }\n',
  'main.ts': "import { add as sum } from './lib';\nconst result = sum(1, 2);\n",
  'decoy.ts': 'export function add(a: string) { return a; }\nconst unrelated = add("x");\n',
};

test('definitions resolve aliases and references exclude identically named unrelated symbols', async t => {
  const {service} = await fixture(t, source);
  const definition = await service.query({operation: 'definition', path: 'main.ts', line: 2, column: 17});
  assert.deepEqual(definition.items.map(x => [x.path, x.line, x.column]), [['lib.ts', 2, 17]]);
  const refs = await service.query({operation: 'references', path: 'lib.ts', line: 2, column: 17});
  assert.deepEqual([...new Set(refs.items.map(x => x.path))].sort(), ['lib.ts', 'main.ts']);
  assert.equal(refs.scope.files, 3);
  assert.equal(refs.scope.config, 'fixed-no-project-config');
  assert.equal(refs.truncated, false);
  assert.match(refs.snapshot, /^[a-f0-9]{64}$/);
});

test('hover reports a bounded signature and implementation finds workspace class', async t => {
  const {service} = await fixture(t, {...source, 'shape.ts': 'export interface Shape { area(): number }\nexport class Square implements Shape { area() { return 4; } }\n'});
  const hover = await service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17});
  assert.match(hover.hover.display, /function add\(a: number, b: number\): number/);
  assert.match(hover.hover.documentation, /Add two values/);
  const implementations = await service.query({operation: 'implementation', path: 'shape.ts', line: 1, column: 18});
  assert.deepEqual(implementations.items.map(x => [x.path, x.line, x.column]), [['shape.ts', 2, 14]]);
});

test('JavaScript navigation uses fresh disk snapshots', async t => {
  const {root, service} = await fixture(t, {'a.js': 'export const count = 1;\n', 'b.js': "import {count} from './a.js';\ncount;\n"});
  const before = await service.query({operation: 'hover', path: 'a.js', line: 1, column: 14});
  await writeFile(path.join(root, 'a.js'), 'export const count = "changed";\n');
  const after = await service.query({operation: 'hover', path: 'a.js', line: 1, column: 14});
  assert.notEqual(before.snapshot, after.snapshot);
  assert.match(after.hover.display, /changed/);
  const definition = await service.query({operation: 'definition', path: 'b.js', line: 2, column: 2});
  assert.equal(definition.items[0].path, 'a.js');
});

test('rejects outside paths, excluded paths, unsupported files and invalid positions', async t => {
  const {service} = await fixture(t, {...source, 'readme.md': 'text', 'node_modules/secret.ts': 'secret'});
  for (const query of [
    {path: '../secret.ts'}, {path: 'C:\\outside.ts'}, {path: '/outside.ts'}, {path: 'node_modules/secret.ts'},
    {path: 'readme.md'}, {line: 0}, {column: 0}, {line: 200}, {column: 200}, {operation: 'execute'},
  ]) {
    await assert.rejects(service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17, ...query}), error => /^SEMANTIC_/.test(error.code));
  }
});

test('outside directory junctions are neither indexed nor navigable', async t => {
  const {root, service} = await fixture(t, source);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'muse-semantic-outside-'));
  t.after(() => rm(outside, {recursive: true, force: true}));
  await writeFile(path.join(outside, 'secret.ts'), 'export const privateValue = 42;');
  await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(service.query({operation: 'hover', path: 'linked/secret.ts', line: 1, column: 15}), {code: 'SEMANTIC_PATH'});
  const result = await service.query({operation: 'references', path: 'lib.ts', line: 2, column: 17});
  assert.equal(result.scope.files, 3);
  assert.equal(result.scope.skipped.symlinks, 1);
});

test('project configuration and plugins are ignored and cannot pull outside imports into the host', async t => {
  const outside = await mkdtemp(path.join(os.tmpdir(), 'muse-semantic-private-'));
  t.after(() => rm(outside, {recursive: true, force: true}));
  await writeFile(path.join(outside, 'secret.ts'), 'export const secret = "PRIVATE_NAVIGATION_SENTINEL";');
  const {service} = await fixture(t, {...source,
    'tsconfig.json': '{"extends":"../outside.json","compilerOptions":{"plugins":[{"name":"./plugin.cjs"}],"paths":{"*": ["../*"]}}}',
    'plugin.cjs': 'throw new Error("project plugin must never run");',
    'outside-import.ts': `/// <reference path="${outside.replace(/\\/g, '/')}/secret.ts" />\nimport { secret } from "${outside.replace(/\\/g, '/')}/secret";\nsecret;\n`,
  });
  const result = await service.query({operation: 'definition', path: 'outside-import.ts', line: 3, column: 2});
  assert.ok(result.items.every(item => item.path === 'outside-import.ts'));
  const hover = await service.query({operation: 'hover', path: 'outside-import.ts', line: 3, column: 2});
  assert.doesNotMatch(JSON.stringify(hover), /PRIVATE_NAVIGATION_SENTINEL/);
});

test('file and byte caps fail closed instead of presenting a partial project as complete', async t => {
  const capped = await fixture(t, source, {maxFiles: 1});
  await assert.rejects(capped.service.query({operation: 'references', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_LIMIT'});
  const large = await fixture(t, {'big.ts': 'const big = 1;\n'.repeat(30)}, {maxFileBytes: 100});
  await assert.rejects(large.service.query({operation: 'hover', path: 'big.ts', line: 1, column: 7}), {code: 'SEMANTIC_LIMIT'});
  const total = await fixture(t, source, {maxTotalBytes: 100});
  await assert.rejects(total.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_LIMIT'});
});

test('result and hover limits report truncation', async t => {
  const {service} = await fixture(t, source, {maxResults: 1, maxHoverChars: 12});
  const refs = await service.query({operation: 'references', path: 'lib.ts', line: 2, column: 17});
  assert.equal(refs.items.length, 1);
  assert.equal(refs.truncated, true);
  const hover = await service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17});
  assert.ok(hover.hover.display.length + hover.hover.documentation.length <= 12);
  assert.equal(hover.truncated, true);
});

test('deadline terminates work and disposal rejects pending and subsequent queries', async t => {
  const timed = await fixture(t, source, {timeoutMs: 1});
  await assert.rejects(timed.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_TIMEOUT'});
  const {service} = await fixture(t, source);
  const query = service.query({operation: 'references', path: 'lib.ts', line: 2, column: 17});
  const rejection = assert.rejects(query, {code: 'SEMANTIC_DISPOSED'});
  await service.dispose();
  await rejection;
  await assert.rejects(service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_DISPOSED'});
});

test('concurrent requests do not start unbounded workers', async t => {
  const {service} = await fixture(t, source);
  const pending = service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17});
  await assert.rejects(service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_BUSY'});
  await pending;
});

test('directory-entry and nesting budgets bound discovery even without matching source files', async t => {
  const entries = await fixture(t, {...source, 'notes.txt': 'irrelevant'}, {maxEntries: 2});
  await assert.rejects(entries.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_LIMIT'});
  const deep = await fixture(t, {...source, 'a/b/c/notes.txt': 'irrelevant'}, {maxDepth: 1});
  await assert.rejects(deep.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_LIMIT'});
});

test('globally limits simultaneous projects and recovers after disposal', async t => {
  const a = await fixture(t, source), b = await fixture(t, source), c = await fixture(t, source);
  const first = a.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17});
  const second = b.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17});
  const firstCancelled = assert.rejects(first, {code: 'SEMANTIC_DISPOSED'});
  const secondCancelled = assert.rejects(second, {code: 'SEMANTIC_DISPOSED'});
  await assert.rejects(c.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_BUSY'});
  await Promise.all([a.service.dispose(), b.service.dispose(), a.service.dispose(), firstCancelled, secondCancelled]);
  assert.ok((await c.service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17})).hover);
});

test('a bound workspace junction cannot be retargeted to a different project', async t => {
  const a = await fixture(t, source), b = await fixture(t, source);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'muse-semantic-binding-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const link = path.join(directory, 'workspace');
  await symlink(a.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  const service = implementation.createSemanticNavigation(link);
  t.after(() => service.dispose());
  await service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17});
  await rm(link);
  await symlink(b.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(service.query({operation: 'hover', path: 'lib.ts', line: 2, column: 17}), {code: 'SEMANTIC_PATH'});
});

test('semantic fixture removes lexical decoys and discovers an aliased use', async t => {
  const {service} = await fixture(t, source);
  const lexicalHits = Object.values(source).flatMap(text => [...text.matchAll(/\badd\b/g)]).length;
  const began = performance.now();
  const result = await service.query({operation: 'references', path: 'lib.ts', line: 2, column: 17});
  assert.equal(lexicalHits, 4);
  assert.equal(result.items.length, 4);
  assert.ok(result.items.some(item => item.path === 'main.ts' && item.line === 2 && item.column === 16));
  assert.ok(result.items.every(item => item.path !== 'decoy.ts'));
  t.diagnostic(JSON.stringify({fixture: 'alias-and-unrelated-name', lexicalHits, lexicalDecoys: 2, semanticHits: result.items.length, aliasedUsesFound: 1, elapsedMs: Math.round(performance.now() - began), engine: result.engine}));
});
