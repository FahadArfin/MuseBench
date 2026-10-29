import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CURATED_EXTENSIONS, searchCuratedExtensions } from '../src/shared/extension-catalog.mjs';

const service = async (t, fetch) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'catalog-test-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const { createExtensionCatalog } = await import('../electron/extension-catalog.mjs');
  return { catalog: createExtensionCatalog({ dataDir, fetch }), dataDir, createExtensionCatalog };
};

test('expanded community sources search every entry before pagination', async t => {
 const {catalog}=await service(t,async url=>Response.json(url.includes('/git/trees/')?{tree:url.includes('/github/awesome-copilot/')?Array.from({length:240},(_,i)=>({type:'blob',path:`skills/workflow-${i}/SKILL.md`})) : url.includes('/wshobson/agents/')?[{type:'blob',path:'plugins/testing/skills/rare-workflow/SKILL.md'}]:[]}: {plugins:[]}));
 const first=await catalog.search({kind:'skills',source:'community'});assert.equal(first.entries.length,30);assert(first.nextCursor);
 const found=await catalog.search({kind:'skills',source:'community',query:'workflow-239'});assert.equal(found.entries.length,1);assert.equal(found.entries[0].package.repo,'github/awesome-copilot');
 const nested=await catalog.search({kind:'skills',source:'community',query:'rare-workflow'});assert.equal(nested.entries[0].package.path,'plugins/testing/skills/rare-workflow');
});

test('GitHub Copilot marketplace relative sources are reviewed packages, not arbitrary paths',async t=>{
 const {catalog}=await service(t,async()=>Response.json({plugins:[{name:'sample',description:'Safe metadata',source:'plugins/sample'},{name:'escape',source:'plugins/../../escape'}]}));
 const result=await catalog.search({kind:'plugins',source:'community',query:'sample'});
 const entry=result.entries.find(e=>e.id==='plugin:github-copilot:sample');assert.equal(entry.package.path,'plugins/sample');assert.equal(entry.compatibility,'unverified');
 const unsafe=await catalog.search({kind:'plugins',source:'community',query:'escape'});assert(unsafe.entries.every(e=>!e.package));
});
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
  const restricted = ['hatch-pet', 'define-goal', 'migrate-to-codex', 'playwright', 'jupyter-notebook'];
  const { catalog } = await service(t, async url => Response.json({ tree: url.includes('/openai/skills/') ? [...restricted, 'gh-fix-ci'].map(name => ({ type: 'blob', path: `skills/.curated/${name}/SKILL.md` })) : [] }));
  const page = await catalog.search({ kind: 'skills', source: 'community' });
  for (const name of restricted) {
    const entry = page.entries.find(item => item.title === name);
    assert.equal(entry.compatibility, 'setup-required', `${name} must not offer automatic installation`);
    assert.equal(entry.package, undefined);
    const resolved = await catalog.resolve(entry.id);
    assert.equal(resolved.compatibility, 'setup-required');assert.equal(resolved.package, undefined);
  }
  assert.equal(CURATED_EXTENSIONS.find(entry => entry.id === 'skill:openai/skills:jupyter-notebook').compatibility, 'setup-required');
  assert.equal(page.entries.find(entry => entry.title === 'gh-fix-ci').package.path, 'skills/.curated/gh-fix-ci');
});
test('invalid plugin refresh preserves the last schema-valid snapshot', async t => {
  let malformed = false;
  const { catalog } = await service(t, async () => Response.json(malformed ? { message: 'unexpected error body' } : { plugins: [{ name: 'cached', source: './plugins/cached' }] }));
  await catalog.search({ kind: 'plugins', source: 'community' });
  malformed = true;
  const page = await catalog.search({ kind: 'plugins', source: 'community', refresh: true });
  assert.equal(page.entries.length, 5);
  assert.equal(page.stale, true);
  assert.equal(page.offline, true);
  assert.match(page.errors[0], /plugins/i);
});
test('nested null skill records are source errors rather than uncaught exceptions', async t => {
  const { catalog } = await service(t, async () => Response.json({ tree: [null] }));
  const page = await catalog.search({ kind: 'skills', source: 'community' });
  assert.equal(page.entries.length, 0);
  assert.equal(page.offline, true);
  assert.equal(page.errors.length, 6);
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

test('curated rows have unique identities and compact local presentation metadata', () => {
  const categories = new Set(['developer-tools', 'productivity', 'design', 'business', 'data', 'documents', 'workflows', 'research', 'quality', 'cloud', 'ai']);
  assert.equal(new Set(CURATED_EXTENSIONS.map(item => item.id)).size, CURATED_EXTENSIONS.length);
  for (const entry of CURATED_EXTENSIONS) {
    assert.ok(categories.has(entry.category), `${entry.id}: category`);
    assert.match(entry.icon, /^[a-z][a-z0-9-]*$/, `${entry.id}: local icon slug`);
    assert.equal(typeof entry.popular, 'boolean');
    assert.ok(entry.summary.length > 12 && entry.summary.length <= 160, `${entry.id}: compact summary`);
    assert.ok(entry.tags.length > 0, `${entry.id}: search tags`);
  }
});

test('curated search finds purpose tags and categories across stable pagination', () => {
  assert.ok(searchCuratedExtensions({ kind: 'mcp', query: 'postgres' }).entries.some(item => item.id === 'mcp:neon'));
  assert.ok(searchCuratedExtensions({ kind: 'plugins', query: 'workflows' }).entries.some(item => item.id === 'plugin:obra:superpowers'));
  const entries = []; let cursor;
  do {
    const page = searchCuratedExtensions({ kind: 'skills', query: '', cursor });
    entries.push(...page.entries); cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(entries.map(item => item.id), CURATED_EXTENSIONS.filter(item => item.kind === 'skills').map(item => item.id));
});

test('qualified connectors use the same exact reviewed recipe as their server counterpart', () => {
  for (const name of ['stripe', 'atlassian', 'neon', 'todoist', 'intercom', 'cloudflare']) {
    const server = CURATED_EXTENSIONS.find(item => item.recipe?.name === name && item.kind === 'mcp');
    const connector = CURATED_EXTENSIONS.find(item => item.id === `connector:${name}`);
    assert.equal(server?.compatibility, 'recipe', name);
    assert.deepEqual(connector?.recipe, server?.recipe, name);
    assert.equal(server.recipe.oauth, true, name);
    const url = new URL(server.recipe.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username + url.password + url.search + url.hash, '');
  }
  const docs = CURATED_EXTENSIONS.find(item => item.id === 'mcp:cloudflare-docs');
  assert.equal(docs.recipe.oauth, false);
  assert.equal(docs.recipe.url, 'https://docs.mcp.cloudflare.com/mcp');
});

test('account-bound Codex equivalents remain setup-only with no copied host package or credentials', () => {
  for (const id of ['connector:gmail', 'connector:google-drive', 'connector:google-calendar', 'connector:outlook', 'connector:slack', 'connector:figma', 'setup:github', 'setup:vercel', 'connector:canva', 'connector:hubspot', 'connector:asana']) {
    const entry = CURATED_EXTENSIONS.find(item => item.id === id);
    assert.equal(entry?.compatibility, 'setup-required', id);
    assert.equal(entry.recipe, undefined, id);
    assert.equal(entry.package, undefined, id);
    assert.ok(entry.setup.length > 70, id);
  }
  assert.ok(CURATED_EXTENSIONS.every(item => !JSON.stringify(item).includes('.codex/plugins/cache')));
});
