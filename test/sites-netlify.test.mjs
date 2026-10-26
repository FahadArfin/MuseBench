import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyClient } from '../src/sites/netlify.mjs';
import { bundleFromFiles } from '../src/sites/files.mjs';

const API = 'https://api.netlify.com/api/v1';
const TOKEN = 'fixture-netlify-secret';
const digest = 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d';
const bundle = { files: [{ path: 'index.html', bytes: 5, sha1: digest, mime: 'text/html', data: 'aGVsbG8=' }], totalBytes: 5, hash: 'will-be-recomputed' };
const remote = { id: 'site-a', name: 'my-site', ssl_url: 'https://my-site.netlify.app', url: 'http://my-site.netlify.app', published_deploy: { id: 'deploy-a', site_id: 'site-a' }, account_id: 'team-id', password: 'never-return', build_settings: { env: { KEY: 'never-return' } } };
const sanitized = { id: 'site-a', name: 'my-site', url: 'https://my-site.netlify.app/', publishedDeployId: 'deploy-a', accountId: 'team-id' };
function response(body, status = 200, headers = {}) { return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }); }
function fixture(steps, options = {}) {
  const calls = [];
  const client = createNetlifyClient({ getToken: () => TOKEN, ...options, fetcher: async (url, init) => {
    const next = steps[calls.length];
    calls.push({ url, init });
    assert.ok(next, `Unexpected request ${init.method} ${url}`);
    assert.equal(url, API + next.path);
    assert.equal(init.method, next.method || 'GET');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (next.anonymous) assert.equal(init.headers.Authorization, undefined);
    else assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    if (next.body) assert.deepEqual(JSON.parse(init.body), next.body);
    if (next.bytes) assert.deepEqual(Buffer.from(init.body), Buffer.from(next.bytes));
    if (next.reject) throw next.reject;
    return next.response || response(next.result, next.status || 200);
  } });
  return { client, calls };
}

test('authenticated identity and teams contain only safe UI fields', async () => {
  const { client } = fixture([
    { path: '/user', result: { id: 'user-a', full_name: 'Site Author', email: 'private@example.test', access_token: TOKEN } },
    { path: '/accounts', result: [{ id: 'team-id', slug: 'my-team', name: 'My team', billing_email: 'private@example.test' }] },
  ]);
  assert.deepEqual(await client.identity(), { id: 'user-a', name: 'Site Author' });
  assert.deepEqual(await client.teams(), [{ id: 'team-id', slug: 'my-team', name: 'My team' }]);
});

test('creation resolves the selected team id to its authenticated slug', async () => {
  const { client } = fixture([
    { path: '/accounts', result: [{ id: 'team-id', slug: 'my-team', name: 'My team' }] },
    { path: '/my-team/sites', method: 'POST', body: { name: 'my-site', force_ssl: true }, result: remote, status: 201 },
  ]);
  assert.deepEqual(await client.createSite({ name: 'my-site', teamId: 'team-id' }), sanitized);
});

test('creation rejects a team outside the authenticated account before any mutation', async () => {
  const { client, calls } = fixture([{ path: '/accounts', result: [{ id: 'team-id', slug: 'my-team', name: 'My team' }] }]);
  await assert.rejects(client.createSite({ name: 'my-site', teamId: 'foreign-team' }), /team/i);
  assert.equal(calls.length, 1);
});

test('site metadata strips privileged fields and accepts only HTTPS URLs without credentials', async () => {
  for (const ssl_url of ['http://insecure.test', 'javascript:alert(1)', 'https://secret@host.test', 'https://host.test/?token=secret', 'https://127.0.0.1/']) {
    const { client } = fixture([{ path: '/sites/site-a', result: { ...remote, ssl_url } }]);
    assert.equal((await client.getSite('site-a')).url, null);
  }
  const { client } = fixture([{ path: '/sites/site-a', result: remote }]);
  assert.deepEqual(await client.getSite('site-a'), sanitized);
});

test('getSite rejects a response with a different site identity', async () => {
  const { client } = fixture([{ path: '/sites/site-a', result: { ...remote, id: 'site-b' } }]);
  await assert.rejects(client.getSite('site-a'), /site/i);
});

test('site creation provenance returns only validated timestamps normalized to UTC', async () => {
  for (const [created_at, expected] of [
    ['2026-10-26T12:30:45Z', '2026-10-26T12:30:45.000Z'],
    ['2026-10-26T12:30:45.123456Z', '2026-10-26T12:30:45.123Z'],
    ['2026-10-26T08:30:45-04:00', '2026-10-26T12:30:45.000Z'],
    ['2024-02-29T00:00:00Z', '2024-02-29T00:00:00.000Z'],
  ]) {
    const { client } = fixture([{ path: '/sites/site-a', result: { ...remote, created_at } }]);
    assert.deepEqual(await client.getSite('site-a'), { ...sanitized, createdAt: expected });
  }
});

test('absent or invalid creation timestamps cannot provide recovery provenance', async () => {
  for (const created_at of [undefined, null, 1793017845000, 'yesterday', '2026-10-26', '2026-10-26T12:30:45', '2026-02-30T12:30:45Z', '2026-01-01T24:00:00Z', '2026-01-01T10:61:00Z']) {
    const { client } = fixture([{ path: '/sites?per_page=100&page=1', result: [{ ...remote, created_at }] }]);
    assert.equal(Object.hasOwn((await client.listSites())[0], 'createdAt'), false);
  }
});

test('site discovery uses bounded fixed-host pagination and safe metadata', async () => {
  const full = Array.from({ length: 100 }, (_, index) => ({ ...remote, id: `site-${index}`, published_deploy: null }));
  const { client, calls } = fixture([
    { path: '/sites?per_page=100&page=1', result: full },
    { path: '/sites?per_page=100&page=2', result: [remote] },
  ]);
  const result = await client.listSites();
  assert.equal(result.length, 101);
  assert.deepEqual(result.at(-1), sanitized);
  assert.equal(calls.length, 2);
});

test('digest deploy submits only validated file hashes and explicitly publishes production', async () => {
  const { client } = fixture([{ path: '/sites/site-a/deploys?title=First+publish', method: 'POST', body: { files: { '/index.html': digest }, draft: false, async: false }, result: { id: 'deploy-b', site_id: 'site-a', state: 'uploading', required: [digest], deploy_ssl_url: 'https://deploy-b--my-site.netlify.app' } }]);
  assert.deepEqual(await client.createDeploy('site-a', bundle, { title: 'First publish' }), { id: 'deploy-b', state: 'uploading', required: [digest], url: 'https://deploy-b--my-site.netlify.app/' });
});

test('uploads only required hashes as raw bytes using the documented file endpoint', async () => {
  const { client, calls } = fixture([{ path: '/deploys/deploy-b/files/index.html', method: 'PUT', bytes: 'hello', result: { path: '/index.html', sha: digest } }]);
  await client.uploadDeploy('deploy-b', bundle, [digest, digest]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/octet-stream');
});

test('unknown required hashes are rejected before any upload', async () => {
  const { client, calls } = fixture([]);
  await assert.rejects(client.uploadDeploy('deploy-b', bundle, [digest, 'b'.repeat(40)]), /required|digest|bundle/i);
  assert.equal(calls.length, 0);
});

test('uploads encode each public asset path segment without changing its bytes', async () => {
  const content = bundleFromFiles([{ path: 'index.html', data: '' }, { path: 'assets/a name.css', data: 'hello' }]);
  const { client } = fixture([{ path: '/deploys/deploy-b/files/assets/a%20name.css', method: 'PUT', bytes: 'hello', result: { path: '/assets/a name.css', sha: digest } }]);
  await client.uploadDeploy('deploy-b', content, [digest]);
});

test('deploy inspection and restore verify site identity before remote publication', async () => {
  const { client, calls } = fixture([
    { path: '/sites/site-a/deploys/deploy-a', result: { id: 'deploy-a', site_id: 'site-b', state: 'ready' } },
  ]);
  await assert.rejects(client.restore('site-a', 'deploy-a'), /site/i);
  assert.equal(calls.length, 1);
});

test('deploy recovery lists same-site deploys with exact title markers without mutating', async () => {
  const title = 'MuseBench local-site local-version';
  const { client } = fixture([{ path: '/sites/site-a/deploys?per_page=100&page=1', result: [{ id: 'deploy-a', site_id: 'site-a', state: 'ready', title, error_message: null, deploy_ssl_url: 'https://deploy-a--my-site.netlify.app' }] }]);
  assert.deepEqual(await client.listDeploys('site-a'), [{ id: 'deploy-a', state: 'ready', title, url: 'https://deploy-a--my-site.netlify.app/' }]);
});

test('unknown create response can recover its missing-file list from the same-site deploy', async () => {
  const { client } = fixture([
    { path: '/sites/site-a/deploys/deploy-a', result: { id: 'deploy-a', site_id: 'site-a', state: 'uploading', required: [digest] } },
    { path: '/deploys/deploy-a/files/index.html', method: 'PUT', bytes: 'hello', result: { path: '/index.html', sha: digest } },
  ]);
  const recovered = await client.getDeploy('site-a', 'deploy-a');
  assert.deepEqual(recovered.required, [digest]);
  await client.uploadDeploy(recovered.id, bundle, recovered.required);
});

test('deploy recovery rejects malformed required digests', async () => {
  const { client } = fixture([{ path: '/sites/site-a/deploys/deploy-a', result: { id: 'deploy-a', site_id: 'site-a', state: 'uploading', required: ['../../private.txt'] } }]);
  await assert.rejects(client.getDeploy('site-a', 'deploy-a'), /digest|response/i);
});

test('restore publishes a ready matching deploy then returns current site metadata', async () => {
  const deployment = { id: 'deploy-a', site_id: 'site-a', state: 'ready', deploy_ssl_url: 'https://deploy-a--my-site.netlify.app' };
  const { client } = fixture([
    { path: '/sites/site-a/deploys/deploy-a', result: deployment },
    { path: '/sites/site-a/deploys/deploy-a/restore', method: 'POST', result: deployment, status: 201 },
    { path: '/sites/site-a', result: remote },
  ]);
  assert.deepEqual(await client.restore('site-a', 'deploy-a'), sanitized);
});

test('unpublish honestly requires provider dashboard and never deletes a site', async () => {
  const { client, calls } = fixture([]);
  await assert.rejects(client.unpublish('site-a'), error => error.code === 'UNSUPPORTED' && /dashboard/i.test(error.message));
  assert.equal(calls.length, 0);
});

test('errors redact credentials and failed mutations are never automatically retried', async () => {
  const { client, calls } = fixture([{ path: '/sites', method: 'POST', result: { message: `Bearer ${TOKEN}`, access_token: TOKEN }, status: 503 }]);
  await assert.rejects(client.createSite({ name: 'my-site' }), error => !error.message.includes(TOKEN) && error.outcomeUnknown === true && error.status === 503);
  assert.equal(calls.length, 1);
});

test('ambiguous transport failures are marked unknown and keep token out of diagnostics', async () => {
  const { client, calls } = fixture([{ path: '/sites', method: 'POST', reject: new Error(`fetch failed ${TOKEN}`) }]);
  await assert.rejects(client.createSite({ name: 'my-site' }), error => error.outcomeUnknown === true && !JSON.stringify(error).includes(TOKEN) && !error.message.includes(TOKEN));
  assert.equal(calls.length, 1);
});

test('HTTP authentication failures are known rejections without leaked provider messages', async () => {
  const { client } = fixture([{ path: '/user', result: { message: TOKEN }, status: 401 }]);
  await assert.rejects(client.identity(), error => error.code === 'AUTH_REQUIRED' && error.status === 401 && error.outcomeUnknown === false && !error.message.includes(TOKEN));
});

test('deploy diagnostic redaction happens before truncation so token fragments do not escape', async () => {
  const { client } = fixture([{ path: '/sites/site-a/deploys/deploy-a', result: { id: 'deploy-a', site_id: 'site-a', state: 'error', error_message: 'x'.repeat(992) + TOKEN } }]);
  const result = await client.getDeploy('site-a', 'deploy-a');
  assert.equal(result.error.includes('fixture-'), false);
});

test('malformed success after a mutation is unknown and retains no unsafe remote data', async () => {
  const { client, calls } = fixture([{ path: '/sites', method: 'POST', result: { ...remote, id: `invalid/${TOKEN}` } }]);
  await assert.rejects(client.createSite({ name: 'my-site' }), error => error.outcomeUnknown === true && error.status === 200 && !error.message.includes(TOKEN));
  assert.equal(calls.length, 1);
});

test('client does not trust error codes supplied by the transport to expose its message', async () => {
  const error = Object.assign(new Error(TOKEN), { code: 'PROVIDER_ERROR' });
  const { client } = fixture([{ path: '/user', reject: error }]);
  await assert.rejects(client.identity(), value => !value.message.includes(TOKEN));
});

test('site discovery fails explicitly at the bound rather than treating an incomplete account as complete', async () => {
  const { client, calls } = fixture(Array.from({ length: 10 }, (_, index) => ({ path: `/sites?per_page=100&page=${index + 1}`, result: Array.from({ length: 100 }, (_, n) => ({ ...remote, id: `site-${index}-${n}`, published_deploy: null })) })));
  await assert.rejects(client.listSites(), error => error.code === 'DISCOVERY_LIMIT');
  assert.equal(calls.length, 10);
});

test('missing credentials and unsafe path ids fail before network activity', async () => {
  const { client, calls } = fixture([], { getToken: () => '' });
  await assert.rejects(client.identity(), error => error.code === 'AUTH_REQUIRED');
  await assert.rejects(client.getSite('../secrets'), /identifier/i);
  assert.equal(calls.length, 0);
});

test('oversized, non-JSON and redirected responses are rejected', async () => {
  const replies = [
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '999999999' } }),
    new Response('<html>not an API response</html>', { headers: { 'content-type': 'text/html' } }),
    new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } }),
  ];
  for (const reply of replies) {
    const { client } = fixture([{ path: '/user', response: reply }]);
    await assert.rejects(client.identity(), /response|redirect/i);
  }
});

test('streaming responses are bounded even when Content-Length is absent', async () => {
  let canceled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { canceled = true; } });
  const { client } = fixture([{ path: '/user', response: new Response(stream, { headers: { 'content-type': 'application/json' } }) }]);
  await assert.rejects(client.identity(), /size limit/i);
  assert.equal(canceled, true);
});

test('OAuth refuses unregistered client identity before making any request', async () => {
  const { client, calls } = fixture([]);
  await assert.rejects(client.beginAuth(), error => error.code === 'OAUTH_SETUP_REQUIRED');
  assert.equal(calls.length, 0);
});

test('OAuth tickets are anonymous, bound to this client and exchanged only after authorization', async () => {
  const { client } = fixture([
    { path: '/oauth/tickets?client_id=musebench-client', method: 'POST', anonymous: true, body: { message: 'Connect MuseBench Sites' }, result: { id: 'ticket-a', client_id: 'musebench-client', authorized: false }, status: 201 },
    { path: '/oauth/tickets/ticket-a', anonymous: true, result: { id: 'ticket-a', client_id: 'musebench-client', authorized: false } },
    { path: '/oauth/tickets/ticket-a', anonymous: true, result: { id: 'ticket-a', client_id: 'musebench-client', authorized: true } },
    { path: '/oauth/tickets/ticket-a/exchange', method: 'POST', anonymous: true, result: { id: 'token-a', access_token: 'new-private-token', user_id: 'user-a' }, status: 201 },
  ], { clientId: 'musebench-client' });
  assert.deepEqual(await client.beginAuth(), { id: 'ticket-a', url: 'https://app.netlify.com/authorize?response_type=ticket&ticket=ticket-a' });
  assert.deepEqual(await client.checkAuth('ticket-a'), { authorized: false });
  assert.deepEqual(await client.finishAuth('ticket-a'), { token: 'new-private-token' });
});

test('OAuth exchange refuses foreign or unauthorized tickets and never returns other account fields', async () => {
  const { client, calls } = fixture([{ path: '/oauth/tickets/ticket-a', anonymous: true, result: { id: 'ticket-a', client_id: 'other-client', authorized: true } }], { clientId: 'musebench-client' });
  await assert.rejects(client.finishAuth('ticket-a'), /ticket|client/i);
  assert.equal(calls.length, 1);
});

test('OAuth exchange never consumes an unauthorized ticket', async () => {
  const { client, calls } = fixture([{ path: '/oauth/tickets/ticket-a', anonymous: true, result: { id: 'ticket-a', client_id: 'musebench-client', authorized: false } }], { clientId: 'musebench-client' });
  await assert.rejects(client.finishAuth('ticket-a'), error => error.code === 'AUTH_PENDING');
  assert.equal(calls.length, 1);
});
