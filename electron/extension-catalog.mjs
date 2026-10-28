import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CURATED_EXTENSIONS, searchCuratedExtensions } from '../src/shared/extension-catalog.mjs';

const LIMIT = 2_000_000, MAX_ENTRIES = 1000, TTL = 3_600_000;
const text = (value, max = 1000) => typeof value === 'string' ? value.replace(/[\x00-\x1f]/g, ' ').slice(0, max) : '';
function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function repoUrl(value) {
  const url = safeUrl(value);
  try { const u = new URL(url); return u.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(u.pathname) ? url.replace(/\.git\/?$/, '').replace(/\/$/, '') : ''; } catch { return ''; }
}
function packagePath(value) {
  if (value === '.') return '.';
  const p = text(value, 300).replace(/^\.\//, '');
  return p && p.split('/').every(s => /^[\w.-]+$/.test(s) && s !== '.' && s !== '..') ? p : '';
}
const manifests = [
  { id: 'anthropic-plugins', repo: 'anthropics/claude-plugins-official', file: '.claude-plugin/marketplace.json' },
  { id: 'openai-community', repo: 'openai/community-plugins', file: '.agents/plugins/marketplace.json' },
];
const skillRepos = ['anthropics/skills', 'vercel-labs/agent-skills', 'openai/skills'];
function validateSnapshot(data, url) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid catalog response object');
  if (url.includes('/git/trees/')) {
    if (!Array.isArray(data.tree) || data.tree.some(f => !f || typeof f !== 'object' || typeof f.type !== 'string' || typeof f.path !== 'string')) throw Error('Invalid skills tree response');
    if (data.truncated || data.tree.length > 10000) throw Error('Incomplete skills discovery: upstream tree is truncated or exceeds the 10000-entry limit');
    if (data.tree.filter(f => f.type === 'blob' && f.path.endsWith('/SKILL.md')).length > MAX_ENTRIES) throw Error('Incomplete skills discovery: skill count exceeds the 1000-entry limit');
  } else if (url.includes('marketplace.json')) {
    if (!Array.isArray(data.plugins) || data.plugins.some(p => !p || typeof p !== 'object' || !text(p.name, 160))) throw Error('Invalid plugins catalog response');
    if (data.plugins.length > MAX_ENTRIES) throw Error('Incomplete plugin discovery: catalog exceeds the 1000-entry limit');
  } else {
    if (!Array.isArray(data.servers) || data.servers.some(item => !item || typeof item !== 'object' || !text((item.server || item).name, 200))) throw Error('Invalid MCP Registry servers response');
    if (data.servers.length > 100) throw Error('Incomplete MCP Registry discovery: page exceeds the 100-entry limit');
    if (data.metadata != null && (typeof data.metadata !== 'object' || Array.isArray(data.metadata))) throw Error('Invalid MCP Registry pagination metadata');
    if (data.metadata?.nextCursor != null && (typeof data.metadata.nextCursor !== 'string' || data.metadata.nextCursor.length > 2000)) throw Error('Invalid MCP Registry pagination cursor');
  }
}
function record(id, title, description, kind, publisher, homepage, sourceUrl, extra = {}) {
  return { id, title: text(title, 160), description: text(description), kind, source: 'community', publisher: text(publisher, 120), homepage: safeUrl(homepage) || sourceUrl, tags: [], compatibility: 'setup-required', setup: 'Community metadata is not compatibility verification. Review provider instructions and package capabilities.', provenance: { source: text(publisher, 120), url: sourceUrl }, ...extra };
}
function pluginEntries(data, source) {
  const sourceUrl = `https://github.com/${source.repo}/blob/main/${source.file}`;
  return (Array.isArray(data.plugins) ? data.plugins : []).slice(0, MAX_ENTRIES).filter(p => text(p?.name, 160)).map(p => {
    let repo = '', subpath = '', ref = 'main';
    if (typeof p.source === 'string' && p.source.startsWith('./')) { repo = source.repo; subpath = packagePath(p.source); }
    else if (p.source?.source === 'local') { repo = source.repo; subpath = packagePath(p.source.path); }
    else if (p.source && typeof p.source === 'object') {
      repo = repoUrl(p.source.url || (p.source.repo ? `https://github.com/${p.source.repo}` : ''));
      subpath = packagePath(p.source.path || '.'); ref = text(p.source.sha || p.source.ref, 160) || 'main';
    }
    const pkg = repo && subpath ? { repo: repo.replace('https://github.com/', ''), ref, path: subpath === '.' ? '' : subpath, kind: 'plugin' } : null;
    return record(`plugin:${source.id}:${text(p.name, 160)}`, p.name, p.description, 'plugins', p.author?.name || source.repo.split('/')[0], p.homepage || repo, sourceUrl, pkg ? { package: pkg, compatibility: 'unverified' } : {});
  });
}
async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > LIMIT) throw Error('Catalog response exceeds byte limit');
  const chunks = []; let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.byteLength;
    if (size > LIMIT) throw Error('Catalog response exceeds byte limit');
    chunks.push(Buffer.from(chunk));
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid catalog response object');
  return data;
}
export function createExtensionCatalog({ dataDir, fetch: fetcher = globalThis.fetch } = {}) {
  const records = new Map(CURATED_EXTENSIONS.map(e => [e.id, structuredClone(e)]));
  const memory = new Map(), pending = new Map();
  const cacheDir = dataDir ? path.join(dataDir, 'extension-catalog-cache') : null;
  async function snapshot(url, refresh) {
    const key = createHash('sha256').update(url).digest('hex');
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      let cached = memory.get(key);
      const file = cacheDir && path.join(cacheDir, `${key}.json`);
      if (!cached && file) {
        try { const stat = await fs.stat(file); if (stat.size <= LIMIT + 4096) cached = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* Missing or corrupt cache is replaceable. */ }
      }
      if (cached?.url !== url || !Number.isFinite(cached?.at)) cached = null;
      if (cached) { try { validateSnapshot(cached.data, url); } catch { cached = null; memory.delete(key); } }
      if (cached && !refresh && Date.now() - cached.at < TTL) return { data: cached.data, fetchedAt: new Date(cached.at).toISOString(), stale: false, offline: false };
      try {
        const response = await fetcher(url, { headers: cached?.etag ? { 'If-None-Match': cached.etag, Accept: 'application/json' } : { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
        if (response.status !== 304 && !response.ok) throw Error(`Catalog source returned HTTP ${response.status}`);
        if (response.status === 304 && !cached) throw Error('Unexpected cache response');
        const data = response.status === 304 ? cached.data : await boundedJson(response);
        validateSnapshot(data, url);
        const next = { url, at: Date.now(), etag: text(response.headers.get('etag'), 300) || cached?.etag || '', data };
        memory.set(key, next);
        if (memory.size > 64) memory.delete(memory.keys().next().value);
        if (file) {
          await fs.mkdir(cacheDir, { recursive: true });
          await fs.writeFile(file, JSON.stringify(next), 'utf8');
          const files = await fs.readdir(cacheDir);
          if (files.length > 64) {
            const stats = await Promise.all(files.filter(f => /^[a-f0-9]{64}\.json$/.test(f)).map(async f => ({ f, at: (await fs.stat(path.join(cacheDir, f))).mtimeMs })));
            for (const old of stats.sort((a, b) => b.at - a.at).slice(64)) await fs.unlink(path.join(cacheDir, old.f)).catch(() => {});
          }
        }
        return { data, fetchedAt: new Date(next.at).toISOString(), stale: false, offline: false };
      } catch (error) {
        return { data: cached?.data || {}, fetchedAt: cached ? new Date(cached.at).toISOString() : null, stale: Boolean(cached), offline: true, error: text(error.message, 300) };
      }
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }
  async function search({ kind, query = '', source = 'recommended', cursor, refresh = false } = {}) {
    if (!['skills', 'plugins', 'mcp', 'connectors', 'hooks'].includes(kind)) throw Error('Invalid catalog kind');
    if (!['recommended', 'community'].includes(source)) throw Error('Invalid catalog source');
    query = text(query, 200).trim();
    if (source === 'recommended') return searchCuratedExtensions({ kind, query, cursor });
    let offset = 0, remoteCursor = '';
    if (cursor) {
      try {
        if (typeof cursor !== 'string' || cursor.length > 6000) throw Error();
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        if (parsed.kind !== kind || parsed.query !== query || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > 10000 || typeof parsed.remote !== 'string' || parsed.remote.length > 2000) throw Error();
        offset = parsed.offset; remoteCursor = parsed.remote;
      } catch { throw Error('Invalid catalog cursor'); }
    }
    const encode = (nextOffset, remote = '') => Buffer.from(JSON.stringify({ kind, query, offset: nextOffset, remote })).toString('base64url');
    let entries = [], nextCursor = null, results = [];
    if (kind === 'mcp' || kind === 'connectors') {
      const url = new URL('https://registry.modelcontextprotocol.io/v0.1/servers');
      url.searchParams.set('limit', '30'); url.searchParams.set('version', 'latest');
      if (query) url.searchParams.set('search', query);
      if (remoteCursor) url.searchParams.set('cursor', remoteCursor);
      const result = await snapshot(url.href, refresh); results = [result];
      entries = (Array.isArray(result.data.servers) ? result.data.servers : []).slice(0, 100).filter(item => item && !['deprecated', 'deleted'].includes(item._meta?.['io.modelcontextprotocol.registry/official']?.status)).map(item => item.server || item).filter(s => text(s?.name, 200)).map(s => record(`registry:${text(s.name, 200)}`, s.title || s.name, s.description, kind, s.name.split('/')[0], s.websiteUrl || s.repository?.url, 'https://registry.modelcontextprotocol.io', { provenance: { source: 'Official MCP Registry (community listings)', url: 'https://registry.modelcontextprotocol.io', version: text(s.version, 100) } }));
      const next = text(result.data.metadata?.nextCursor, 2000);
      if (next && next !== remoteCursor) nextCursor = encode(0, next);
    } else if (kind === 'plugins') {
      results = await Promise.all(manifests.map(s => snapshot(`https://raw.githubusercontent.com/${s.repo}/main/${s.file}`, refresh)));
      entries = results.flatMap((r, i) => pluginEntries(r.data, manifests[i]));
    } else if (kind === 'skills') {
      results = await Promise.all(skillRepos.map(repo => snapshot(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, refresh)));
      entries = results.flatMap((r, i) => (Array.isArray(r.data.tree) ? r.data.tree : []).slice(0, 10000).filter(f => f.type === 'blob' && (skillRepos[i] === 'openai/skills' ? /^skills\/\.curated\/[^/]+\/SKILL\.md$/ : /^skills\/.+\/SKILL\.md$/).test(f.path)).slice(0, MAX_ENTRIES).map(f => {
        const subpath = packagePath(f.path.slice(0, -9)); if (!subpath) return null;
        const repo = skillRepos[i], title = subpath.split('/').at(-1), homepage = `https://github.com/${repo}/tree/main/${subpath}`;
        if (repo === 'openai/skills' && ['hatch-pet', 'define-goal', 'migrate-to-codex', 'playwright', 'jupyter-notebook'].includes(title)) {
          return record(`skill:${repo}:${subpath}`, title, 'Public skill with Codex-specific host or wrapper dependencies.', kind, 'OpenAI', homepage, `https://github.com/${repo}`, { setup: 'Requires Codex-specific tools, paths or Bash wrappers. Read upstream instructions and adapt prerequisites before use.' });
        }
        return record(`skill:${repo}:${subpath}`, title, `Public skill from ${repo}. Review SKILL.md, licensing and helper dependencies before installing.`, kind, repo.split('/')[0], homepage, `https://github.com/${repo}`, { compatibility: 'unverified', package: { repo, ref: 'main', path: subpath, kind: 'skill' } });
      }).filter(Boolean));
    }
    if (kind === 'plugins' || kind === 'skills') {
      const needle = query.toLowerCase();
      entries = entries.filter(e => `${e.title} ${e.description} ${e.publisher}`.toLowerCase().includes(needle));
      if (entries.length > offset + 30) nextCursor = encode(offset + 30);
      entries = entries.slice(offset, offset + 30);
    }
    entries = [...new Map(entries.map(e => [e.id, e])).values()];
    for (const entry of entries) records.set(entry.id, structuredClone(entry));
    while (records.size > 3000) { const key = [...records.keys()].find(k => !CURATED_EXTENSIONS.some(e => e.id === k)); records.delete(key); }
    return { entries, nextCursor, stale: results.some(r => r.stale), offline: results.some(r => r.offline), fetchedAt: results.find(r => r.fetchedAt)?.fetchedAt || null, errors: results.filter(r => r.error).map(r => r.error), disclosure: kind === 'mcp' || kind === 'connectors' ? 'Community search sends only your search text to the public MCP Registry. Listings are not compatibility certifications.' : 'Reads public GitHub catalogs; search text is filtered locally. Listings are not compatibility certifications.' };
  }
  return { search, resolve: async id => structuredClone(records.get(id) || null) };
}
