import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const service = async (t, fetch) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'catalog-test-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const { createExtensionCatalog } = await import('../electron/extension-catalog.mjs');
  return { catalog: createExtensionCatalog({ dataDir, fetch }), dataDir, createExtensionCatalog };
};
test('recommended catalog works without network and resolves only known IDs', async t => {
  const { catalog } = await service(t, () => { throw Error('Unexpected network'); });
  const page = await catalog.search({ kind: 'skills' });
  assert.ok(page.entries.length >= 8);
  assert.equal(page.offline, false);
  assert.equal((await catalog.resolve(page.entries[0].id)).id, page.entries[0].id);
  assert.equal(await catalog.resolve('https://evil.invalid/package'), null);
});
test('registry search paginates on demand and sends only search text', async t => {
  const urls = [];
  const { catalog } = await service(t, async url => {
    urls.push(url);
    return Response.json({ servers: [{ server: { name: 'io.test/server', description: 'Test', repository: { url: 'https://github.com/test/server' } } }], metadata: { nextCursor: 'opaque-next' } });
  });
  const page = await catalog.search({ kind: 'mcp', source: 'community', query: 'docs' });
  assert.equal(page.entries[0].id, 'registry:io.test/server');
  assert.equal(page.entries[0].compatibility, 'setup-required');
  assert.ok(page.nextCursor);
  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).searchParams.get('search'), 'docs');
  await catalog.search({ kind: 'mcp', source: 'community', query: 'docs', cursor: page.nextCursor });
  assert.equal(new URL(urls[1]).searchParams.get('cursor'), 'opaque-next');
});
test('cache survives restart and offline refresh retains stale results', async t => {
  const { catalog, dataDir, createExtensionCatalog } = await service(t, async () => Response.json({ servers: [{ server: { name: 'test/server' } }] }));
  await catalog.search({ kind: 'mcp', source: 'community' });
  const offline = createExtensionCatalog({ dataDir, fetch: async () => { throw Error('offline'); } });
  const page = await offline.search({ kind: 'mcp', source: 'community', refresh: true });
  assert.equal(page.entries.length, 1);
  assert.equal(page.offline, true);
  assert.equal(page.stale, true);
});
test('plugin discovery rejects unsafe locations and does not trust remote recipes', async t => {
  const { catalog } = await service(t, async () => Response.json({ plugins: [
    { name: 'safe', description: 'Test', source: './plugins/safe', recipe: { url: 'https://evil.invalid' } },
    { name: 'traversal', source: '../outside' },
    { name: 'credentials', source: { source: 'url', url: 'https://token@github.com/owner/repo.git' } },
  ] }));
  const page = await catalog.search({ kind: 'plugins', source: 'community' });
  assert.ok(page.entries.some(x => x.title === 'safe' && x.package));
  assert.ok(page.entries.every(x => !x.recipe));
  assert.ok(page.entries.filter(x => x.title !== 'safe').every(x => !x.package));
});
test('oversized payloads and invalid cursors fail safely', async t => {
  const { catalog } = await service(t, async () => new Response('x'.repeat(2_100_000)));
  const page = await catalog.search({ kind: 'mcp', source: 'community' });
  assert.equal(page.entries.length, 0);
  assert.equal(page.offline, true);
  assert.ok(page.errors.length);
  await assert.rejects(catalog.search({ kind: 'mcp', source: 'community', cursor: 'not-a-cursor' }), /cursor/i);
});
test('OpenAI skill discovery includes curated directories and excludes release archives', async t => {
  const { catalog } = await service(t, async url => Response.json(url.includes('/openai/skills/') ? { sha: 'a'.repeat(40), tree: [
    { type: 'blob', path: 'skills/.curated/gh-fix-ci/SKILL.md' },
    { type: 'blob', path: 'skills/.curated/playwright/SKILL.md' },
    { type: 'blob', path: 'skills/.curated/playwright.zip' },
    { type: 'blob', path: 'skills/.curated/../../bad/SKILL.md' },
  ] } : { tree: [] }));
  const page = await catalog.search({ kind: 'skills', source: 'community', query: 'gh-fix' });
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].package.path, 'skills/.curated/gh-fix-ci');
  assert.equal(page.entries[0].package.ref, 'main');
  assert.equal(page.entries[0].package.repo, 'openai/skills');
});
test('plugin manifests normalize local and pinned Git sources for installer', async t => {
  const { catalog } = await service(t, async () => Response.json({ plugins: [
    { name: 'local-package', source: { source: 'local', path: './plugins/local-package' } },
    { name: 'pinned-package', source: { source: 'url', url: 'https://github.com/owner/project.git', sha: 'b'.repeat(40) } },
  ] }));
  const page = await catalog.search({ kind: 'plugins', source: 'community' });
  const local = page.entries.find(e => e.id === 'plugin:openai-community:local-package');
  assert.equal(local.package.repo, 'openai/community-plugins');
  assert.equal(local.package.path, 'plugins/local-package');
  const pinned = page.entries.find(e => e.title === 'pinned-package');
  assert.deepEqual(pinned.package, { repo: 'owner/project', ref: 'b'.repeat(40), path: '', kind: 'plugin' });
});
test('fresh snapshots avoid repeat network and conditional refresh reuses 304 data', async t => {
  let calls = 0;
  const { catalog } = await service(t, async (url, options) => {
    calls++;
    if (calls === 1) return Response.json({ servers: [{ server: { name: 'conditional/server' } }] }, { headers: { ETag: '"version-one"' } });
    assert.equal(options.headers['If-None-Match'], '"version-one"');
    return new Response(null, { status: 304 });
  });
  await catalog.search({ kind: 'mcp', source: 'community' });
  await catalog.search({ kind: 'mcp', source: 'community' });
  assert.equal(calls, 1);
  const result = await catalog.search({ kind: 'mcp', source: 'community', refresh: true });
  assert.equal(result.entries[0].title, 'conditional/server');
  assert.equal(result.offline, false);
});
test('malformed JSON shape returns an actionable source error', async t => {
  const { catalog } = await service(t, async () => Response.json(null));
  const page = await catalog.search({ kind: 'mcp', source: 'community' });
  assert.equal(page.offline, true);
  assert.ok(page.errors.length);
});
test('registry omits deprecated listings and exposes repository setup provenance', async t => {
  const { catalog } = await service(t, async () => Response.json({ servers: [
    { server: { name: 'old/server' }, _meta: { 'io.modelcontextprotocol.registry/official': { status: 'deprecated' } } },
    { server: { name: 'new/server', repository: { url: 'https://github.com/example/server' } } },
  ] }));
  const page = await catalog.search({ kind: 'mcp', source: 'community' });
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].homepage, 'https://github.com/example/server');
  assert.equal(page.entries[0].recipe, undefined);
});
test('Codex host-specific community skills remain setup-only', async t => {
  const { catalog } = await service(t, async url => Response.json({ tree: url.includes('/openai/skills/') ? [{ type: 'blob', path: 'skills/.curated/hatch-pet/SKILL.md' }] : [] }));
  const page = await catalog.search({ kind: 'skills', source: 'community' });
  assert.equal(page.entries[0].compatibility, 'setup-required');
  assert.equal(page.entries[0].package, undefined);
});
test('invalid plugin refresh preserves the last schema-valid snapshot', async t => {
  let malformed = false;
  const { catalog } = await service(t, async () => Response.json(malformed ? { message: 'unexpected error body' } : { plugins: [{ name: 'cached', source: './plugins/cached' }] }));
  await catalog.search({ kind: 'plugins', source: 'community' });
  malformed = true;
  const page = await catalog.search({ kind: 'plugins', source: 'community', refresh: true });
  assert.equal(page.entries.length, 2);
  assert.equal(page.stale, true);
  assert.equal(page.offline, true);
  assert.match(page.errors[0], /plugins/i);
});
test('nested null skill records are source errors rather than uncaught exceptions', async t => {
  const { catalog } = await service(t, async () => Response.json({ tree: [null] }));
  const page = await catalog.search({ kind: 'skills', source: 'community' });
  assert.equal(page.entries.length, 0);
  assert.equal(page.offline, true);
  assert.equal(page.errors.length, 3);
});
test('truncated skill trees disclose incomplete discovery and retain prior snapshot', async t => {
  let truncated = false;
  const { catalog } = await service(t, async () => Response.json({ truncated, tree: [{ type: 'blob', path: 'skills/example/SKILL.md' }] }));
  await catalog.search({ kind: 'skills', source: 'community' });
  truncated = true;
  const page = await catalog.search({ kind: 'skills', source: 'community', refresh: true });
  assert.equal(page.stale, true);
  assert.match(page.errors[0], /incomplete|truncated/i);
});
test('registry version is not mislabeled as a source commit or ref', async t => {
  const { catalog } = await service(t, async () => Response.json({ servers: [{ server: { name: 'test/version', version: '1.2.3' } }] }));
  const page = await catalog.search({ kind: 'mcp', source: 'community' });
  assert.equal(page.entries[0].provenance.version, '1.2.3');
  assert.equal(page.entries[0].provenance.ref, undefined);
});
