import { isIP } from 'node:net';
import { validateBundle } from './files.mjs';

// Official API contract: https://open-api.netlify.com/ (2.62.0).
// OAuth ticket flow: https://github.com/netlify/js-client#getaccesstokenticket-opts.
// No provider response, bearer token, or ticket is written to disk or a log here.
const API = 'https://api.netlify.com/api/v1';
const RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const TIMEOUT_MS = 30_000;
const safeErrors = new WeakSet();

function failure(message, { code = 'PROVIDER_ERROR', status, outcomeUnknown = false } = {}) {
  const error = new Error(message);
  safeErrors.add(error);
  error.code = code;
  if (status !== undefined) error.status = status;
  error.outcomeUnknown = outcomeUnknown;
  return error;
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw failure('Invalid Netlify identifier.', { code: 'INVALID_INPUT' });
  return value;
}

function siteName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) throw failure('Use a site name of up to 63 lowercase letters, numbers, and hyphens.', { code: 'INVALID_INPUT' });
  return value;
}

function label(value, fallback = '', max = 160) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
}

function secureUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) return null;
    return url.href;
  } catch { return null; }
}

function createdTimestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, offset] = parts;
  // Date.parse normalizes impossible calendar dates; reject those before using the time as provenance.
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function site(value, expectedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Netlify returned an invalid site response.');
  const id = identifier(value.id);
  if (expectedId && id !== expectedId) throw failure('Netlify returned a different site. Refresh before continuing.');
  const result = { id, name: label(value.name, id), url: secureUrl(value.ssl_url), publishedDeployId: null };
  if (value.published_deploy) {
    if (value.published_deploy.site_id && value.published_deploy.site_id !== id) throw failure('Netlify returned a deploy belonging to a different site.');
    result.publishedDeployId = identifier(value.published_deploy.id);
  }
  if (value.account_id) result.accountId = identifier(value.account_id);
  const createdAt = createdTimestamp(value.created_at);
  if (createdAt) result.createdAt = createdAt;
  return result;
}

function deployment(value, expectedSite, expectedId, token = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Netlify returned an invalid deploy response.');
  const id = identifier(value.id);
  if (value.site_id !== expectedSite || (expectedId && id !== expectedId)) throw failure('Netlify returned a deploy belonging to a different site or version.');
  if (typeof value.state !== 'string' || !/^[a-z_]{1,40}$/.test(value.state)) throw failure('Netlify returned an invalid deploy state.');
  const result = { id, state: value.state };
  if (value.required !== undefined && value.required !== null) {
    if (!Array.isArray(value.required) || value.required.length > 200 || value.required.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{40}$/.test(hash))) throw failure('Netlify returned invalid required file digests.');
    result.required = [...new Set(value.required)];
  }
  if (typeof value.title === 'string') result.title = label(value.title, '', 300);
  const url = secureUrl(value.deploy_ssl_url);
  if (url) result.url = url;
  if (value.error_message) {
    // Keep the error useful but remove the current credential even if echoed by a proxy.
    const message = label(value.error_message, '', RESPONSE_BYTES);
    result.error = (token ? message.split(token).join('[redacted]') : message).slice(0, 1000);
  }
  return result;
}

function tokenValue(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 || !/^[\x21-\x7e]+$/.test(value)) throw failure('Connect your Netlify account to continue.', { code: 'AUTH_REQUIRED' });
  return value;
}

async function readJson(response) {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw failure('Netlify response exceeded the size limit.');
  }
  if (response.status === 204) return null;
  if (!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel().catch(() => {});
    throw failure('Netlify returned a non-JSON response.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw failure('Netlify returned an empty response.');
  let length = 0;
  const parts = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > RESPONSE_BYTES) throw failure('Netlify response exceeded the size limit.');
      parts.push(Buffer.from(next.value));
    }
    return JSON.parse(Buffer.concat(parts, length).toString('utf8'));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (safeErrors.has(error)) throw error;
    throw failure('Netlify returned an invalid JSON response.');
  } finally { reader.releaseLock(); }
}

/** Main-process-only provider. Calls never retry a remote mutation automatically. */
export function createNetlifyClient({ getToken, fetcher = fetch, clientId = '' } = {}) {
  if (typeof getToken !== 'function' || typeof fetcher !== 'function') throw new TypeError('Netlify requires a token getter and fetch function.');

  async function request(path, { method = 'GET', json, bytes, anonymous = false, parse } = {}) {
    const mutating = method !== 'GET';
    const headers = { Accept: 'application/json', 'User-Agent': 'MuseBench-Sites/0.1' };
    let token = '';
    if (!anonymous) {
      try { token = tokenValue(await getToken()); }
      catch { throw failure('Connect your Netlify account to continue.', { code: 'AUTH_REQUIRED' }); }
      headers.Authorization = `Bearer ${token}`;
    }
    let body;
    if (json !== undefined) { body = JSON.stringify(json); headers['Content-Type'] = 'application/json'; }
    if (bytes !== undefined) { body = bytes; headers['Content-Type'] = 'application/octet-stream'; }
    if (body !== undefined && Buffer.byteLength(body) > REQUEST_BYTES) throw failure('The Netlify request exceeded the size limit.', { code: 'INVALID_INPUT' });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    timer.unref?.();
    let status;
    try {
      const response = await fetcher(API + path, { method, headers, body, redirect: 'error', signal: abort.signal });
      status = response.status;
      if (response.redirected || (status >= 300 && status < 400)) throw failure('Netlify redirected the API response; the request was stopped.', { status, outcomeUnknown: mutating });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        const code = status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
        const message = status === 401 ? 'Netlify sign-in expired. Reconnect your account.' : status === 403 ? 'Netlify denied this action. Check your team permissions.' : status === 429 ? 'Netlify rate limit reached. Wait before refreshing or trying again.' : `Netlify request failed (HTTP ${status}).`;
        throw failure(message, { code, status, outcomeUnknown: mutating && (status >= 500 || status === 408) });
      }
      const value = await readJson(response);
      return parse ? parse(value, token) : value;
    } catch (error) {
      if (safeErrors.has(error)) {
        // Any malformed success response may follow a completed mutation.
        if (mutating && status >= 200 && status < 300) error.outcomeUnknown = true;
        if (error.status === undefined && status !== undefined) error.status = status;
        throw error;
      }
      throw failure(abort.signal.aborted ? 'Netlify request timed out. Refresh to check its outcome.' : 'Could not reach Netlify. Refresh to check the outcome before trying again.', { code: 'NETWORK_ERROR', status, outcomeUnknown: mutating });
    } finally { clearTimeout(timer); }
  }

  async function identity() {
    return request('/user', { parse: value => ({ id: identifier(value?.id), name: label(value?.full_name, 'Netlify account') }) });
  }

  async function teams() {
    return request('/accounts', { parse: value => {
      if (!Array.isArray(value) || value.length > 1000) throw failure('Netlify returned an invalid teams response.');
      return value.map(account => ({ id: identifier(account.id), slug: siteName(account.slug), name: label(account.name, account.slug) }));
    } });
  }

  async function createSite({ name, teamId } = {}) {
    siteName(name);
    let path = '/sites';
    if (teamId) {
      identifier(teamId);
      const team = (await teams()).find(entry => entry.id === teamId);
      if (!team) throw failure('The selected Netlify team is not available to this account.', { code: 'INVALID_INPUT' });
      path = `/${team.slug}/sites`;
    }
    return request(path, { method: 'POST', json: { name, force_ssl: true }, parse: value => site(value) });
  }

  async function getSite(id) { identifier(id); return request(`/sites/${id}`, { parse: value => site(value, id) }); }

  async function pages(path, parse) {
    const result = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await request(`${path}?per_page=${PAGE_SIZE}&page=${page}`, { parse: (value, token) => {
        if (!Array.isArray(value) || value.length > PAGE_SIZE) throw failure('Netlify returned an invalid listing response.');
        return value.map(entry => parse(entry, token));
      } });
      result.push(...batch);
      if (batch.length < PAGE_SIZE) return result;
    }
    throw failure('There are more than 1,000 Netlify results. Check the provider dashboard to locate this site or deploy.', { code: 'DISCOVERY_LIMIT' });
  }

  async function listSites() { return pages('/sites', value => site(value)); }
  async function listDeploys(siteId) { identifier(siteId); return pages(`/sites/${siteId}/deploys`, (value, token) => deployment(value, siteId, undefined, token)); }

  async function createDeploy(siteId, value, { title = '' } = {}) {
    identifier(siteId);
    if (typeof title !== 'string' || title.length > 300 || /[\u0000-\u001f\u007f]/.test(title)) throw failure('Invalid deploy title.', { code: 'INVALID_INPUT' });
    const bundle = validateBundle(value);
    const files = Object.fromEntries(bundle.files.map(file => [`/${file.path}`, file.sha1]));
    const hashes = new Set(bundle.files.map(file => file.sha1));
    const query = title ? `?${new URLSearchParams({ title })}` : '';
    return request(`/sites/${siteId}/deploys${query}`, { method: 'POST', json: { files, draft: false, async: false }, parse: (result, token) => {
      const clean = deployment(result, siteId, undefined, token);
      const required = result.required ?? [];
      if (!Array.isArray(required) || required.length > bundle.files.length || required.some(hash => typeof hash !== 'string' || !hashes.has(hash))) throw failure('Netlify requested a file digest outside this site bundle.');
      if (['required_functions', 'required_edge_functions', 'required_server'].some(key => Array.isArray(result[key]) && result[key].length)) throw failure('Netlify requested server code for a static site.');
      return { ...clean, required: [...new Set(required)] };
    } });
  }

  async function uploadDeploy(deployId, value, required) {
    identifier(deployId);
    const bundle = validateBundle(value);
    const byHash = new Map(bundle.files.map(file => [file.sha1, file]));
    if (!Array.isArray(required) || required.length > 400 || required.some(hash => typeof hash !== 'string' || !byHash.has(hash))) throw failure('A required file digest is missing from the site bundle.', { code: 'INVALID_INPUT' });
    // Validate the complete request before uploading anything; identical files upload once.
    for (const hash of new Set(required)) {
      const file = byHash.get(hash);
      const path = file.path.split('/').map(encodeURIComponent).join('/');
      await request(`/deploys/${deployId}/files/${path}`, { method: 'PUT', bytes: Buffer.from(file.data, 'base64') });
    }
  }

  async function getDeploy(siteId, deployId) {
    identifier(siteId); identifier(deployId);
    return request(`/sites/${siteId}/deploys/${deployId}`, { parse: (value, token) => deployment(value, siteId, deployId, token) });
  }

  async function restore(siteId, deployId) {
    const previous = await getDeploy(siteId, deployId);
    if (previous.state !== 'ready') throw failure('Only a ready deploy can be restored.', { code: 'INVALID_INPUT' });
    await request(`/sites/${siteId}/deploys/${deployId}/restore`, { method: 'POST', parse: (value, token) => deployment(value, siteId, deployId, token) });
    try { return await getSite(siteId); }
    catch { throw failure('Netlify accepted the restore, but its published state could not be confirmed. Refresh before trying again.', { code: 'NETWORK_ERROR', outcomeUnknown: true }); }
  }

  async function unpublish(siteId) {
    identifier(siteId);
    // OpenAPI has no documented project-unpublish operation. Do not guess a private endpoint or delete the project.
    throw failure('Manage site availability in the Netlify dashboard. The public API does not document site unpublishing.', { code: 'UNSUPPORTED' });
  }

  function registeredClient() {
    if (!clientId) throw failure('Browser sign-in requires a registered MuseBench Netlify OAuth application. Use a personal access token until it is configured.', { code: 'OAUTH_SETUP_REQUIRED' });
    return identifier(clientId);
  }

  async function beginAuth() {
    const registration = registeredClient();
    return request(`/oauth/tickets?${new URLSearchParams({ client_id: registration })}`, { method: 'POST', anonymous: true, json: { message: 'Connect MuseBench Sites' }, parse: value => {
      const id = identifier(value?.id);
      if (value.client_id !== registration) throw failure('Netlify returned an OAuth ticket for a different client.');
      return { id, url: `https://app.netlify.com/authorize?${new URLSearchParams({ response_type: 'ticket', ticket: id })}` };
    } });
  }

  async function checkAuth(id) {
    const registration = registeredClient(); identifier(id);
    return request(`/oauth/tickets/${id}`, { anonymous: true, parse: value => {
      if (value?.id !== id || value.client_id !== registration || typeof value.authorized !== 'boolean') throw failure('Netlify returned an invalid or unrelated OAuth ticket.');
      return { authorized: value.authorized };
    } });
  }

  async function finishAuth(id) {
    const state = await checkAuth(id);
    if (!state.authorized) throw failure('Finish the Netlify browser sign-in before connecting.', { code: 'AUTH_PENDING' });
    return request(`/oauth/tickets/${id}/exchange`, { method: 'POST', anonymous: true, parse: value => ({ token: tokenValue(value?.access_token) }) });
  }

  return { identity, teams, createSite, getSite, listSites, createDeploy, uploadDeploy, getDeploy, listDeploys, restore, unpublish, beginAuth, checkAuth, finishAuth };
}
