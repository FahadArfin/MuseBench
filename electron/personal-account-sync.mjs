import {createHash} from 'node:crypto';
import {normalizeMetaAccount, readMetaAccount} from './personal-account.mjs';

const PROFILE_REFRESH_MS = 5 * 60 * 1000;

function accountProfile(account, previous) {
  const accountId = `meta:${createHash('sha256').update(account.handle.toLowerCase()).digest('hex')}`;
  const accountName = account.displayName || (previous?.accountId === accountId ? previous.accountName : null) || account.handle;
  return {accountId, accountName, displayName:accountName, handle:account.handle, avatarSeed:accountId};
}

// This only coordinates display metadata from signed-in provider documents. The
// caller owns the sandboxed document factory and the shared provider session.
export function createPersonalAccountSync({
  read = readMetaAccount,
  source = () => null,
  openDocument,
  onChange = () => {},
  enabled = () => true,
  intervalMs = 60000,
  retryMs = 5000,
  settleMs = 250,
  timeoutMs = 12000,
  now = Date.now,
} = {}) {
  let started = false, closed = false, generation = 0, timer = null, active = null, pending = false;
  let profile = null, enrichmentHandle = null, enrichedAt = -Infinity, staleSource = null;
  let lastConfirmedHandle = null, requireFreshIdentity = false, failedOwnedAttempts = 0;
  const safeEnabled = () => { try { return enabled() === true; } catch { return false; } };
  const publish = next => {
    if (JSON.stringify(profile) === JSON.stringify(next)) return;
    profile = next;
    onChange(next ? {...next} : null);
  };
  const schedule = delay => {
    if (closed || !started || active) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void run(); }, Math.max(1, delay));
    timer.unref?.();
  };
  const request = () => {
    if (closed) return;
    started = true;
    if (active) { pending = true; return; }
    schedule(settleMs);
  };
  const invalidate = () => {
    if (closed) return;
    generation++;
    requireFreshIdentity = true;
    failedOwnedAttempts = 0;
    enrichmentHandle = null;
    enrichedAt = -Infinity;
    publish(null);
    pending = true;
    active?.controller.abort();
    if (!active) { pending = false; schedule(retryMs); }
  };
  const run = async () => {
    if (closed || active) return;
    if (!safeEnabled()) {
      if (profile) requireFreshIdentity = true;
      publish(null);
      schedule(retryMs);
      return;
    }
    const job = {controller:new AbortController(), generation, documents:new Set()};
    active = job;
    const {signal} = job.controller;
    const timeout = setTimeout(() => job.controller.abort(), Math.max(1, timeoutMs));
    timeout.unref?.();
    let retry = true, origin = null, usedOwnedRoot = false, attemptedOwned = false;
    const valid = () => {
      if (closed || signal.aborted || generation !== job.generation || !safeEnabled()) return false;
      try { return !origin || !origin.valid || origin.valid() === true; } catch { return false; }
    };
    const closeDocument = document => {
      if (!job.documents.delete(document)) return;
      try { document.close(); } catch { /* Closing a provider view is best effort. */ }
    };
    const waitFor = promise => new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('Account read cancelled')); };
      if (signal.aborted) { reject(new Error('Account read cancelled')); return; }
      signal.addEventListener('abort', abort, {once:true});
      Promise.resolve(promise).then(value => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      }, error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      });
    });
    const pause = () => new Promise(resolve => {
      const done = () => { clearTimeout(delay); signal.removeEventListener('abort', done); resolve(); };
      const delay = setTimeout(done, Math.max(1, settleMs));
      delay.unref?.();
      signal.addEventListener('abort', done, {once:true});
      if (signal.aborted) done();
    });
    const open = async url => {
      if (!valid() || typeof openDocument !== 'function') return null;
      attemptedOwned = true;
      // A factory that finishes after cancellation must not leak its view.
      const opening = Promise.resolve().then(() => openDocument(url, signal)).then(document => {
        if (!document?.contents || typeof document.close !== 'function') {
          try { document?.close?.(); } catch { /* Ignore disposal errors. */ }
          return null;
        }
        job.documents.add(document);
        if (!valid()) { closeDocument(document); return null; }
        return document;
      });
      return waitFor(opening);
    };
    const inspect = async (contents, owned, expectedHandle) => {
      while (valid()) {
        const account = normalizeMetaAccount(await waitFor(Promise.resolve().then(() => read(contents))));
        if (!valid()) return {status:'unavailable'};
        if (!owned || account.status === 'signed-out') return account;
        if (account.status === 'ready' && (!expectedHandle || account.handle.toLowerCase() !== expectedHandle || account.displayName)) return account;
        await pause();
      }
      return {status:'unavailable'};
    };
    const inspectFreshRoot = async () => {
      usedOwnedRoot = true;
      const document = await open('https://www.meta.ai/');
      if (!document || !valid()) return {status:'unavailable'};
      try { return await inspect(document.contents, true); }
      finally { closeDocument(document); }
    };
    try {
      origin = source();
      if (origin && (!origin.contents || !valid())) return;
      if (staleSource) {
        let unchanged = false;
        try { unchanged = staleSource.contents === origin?.contents && (!staleSource.valid || staleSource.valid() === true); } catch { /* Replaced source. */ }
        if (unchanged) origin = null;
        else staleSource = null;
      }
      let account = origin ? await inspect(origin.contents, false) : await inspectFreshRoot();
      if (!valid()) return;
      const verifyRetainedIdentity = account.status === 'ready' && (requireFreshIdentity || (lastConfirmedHandle && account.handle.toLowerCase() !== lastConfirmedHandle));
      const verifyRetainedLogout = account.status === 'signed-out' && lastConfirmedHandle;
      if (origin && (verifyRetainedIdentity || verifyRetainedLogout)) {
        // Retained views can show a previously signed-in account. A different
        // or returning identity, including a contradictory signed-out view,
        // must match a new document in the current shared session.
        const candidate = account;
        account = await inspectFreshRoot();
        if (!valid()) return;
        if ((account.status === 'signed-out' && candidate.status === 'ready') ||
            (account.status === 'ready' && (candidate.status !== 'ready' || account.handle.toLowerCase() !== candidate.handle.toLowerCase()))) staleSource = origin;
      }
      if (account.status === 'signed-out') {
        requireFreshIdentity = true;
        enrichmentHandle = null;
        enrichedAt = -Infinity;
        publish(null);
        retry = false;
        return;
      }
      if (account.status !== 'ready') return;
      lastConfirmedHandle = account.handle.toLowerCase();
      requireFreshIdentity = false;
      const next = accountProfile(account, profile);
      if (profile && profile.accountId !== next.accountId) publish(null);
      publish(next);
      retry = false;
      const handle = account.handle.toLowerCase();
      if (account.displayName) {
        enrichmentHandle = handle;
        enrichedAt = now();
        return;
      }
      if (enrichmentHandle === handle && now() - enrichedAt < PROFILE_REFRESH_MS) return;
      retry = true;
      const ownDocument = await open(`https://www.meta.ai/@${account.handle}`);
      if (!ownDocument || !valid()) return;
      const ownAccount = await inspect(ownDocument.contents, true, handle);
      if (!valid()) return;
      if (ownAccount.status === 'signed-out' || (ownAccount.status === 'ready' && ownAccount.handle.toLowerCase() !== handle)) {
        // The shared session changed while this retained source document was
        // still showing an old account. Do not restore it from that same DOM.
        staleSource = origin;
        requireFreshIdentity = true;
        publish(null);
        enrichmentHandle = null;
        enrichedAt = -Infinity;
        retry = true;
        return;
      }
      if (ownAccount.status === 'ready' && ownAccount.displayName) {
        publish(accountProfile(ownAccount, profile));
        enrichmentHandle = handle;
        enrichedAt = now();
        retry = false;
      }
    } catch {
      // A temporary provider load failure must not replace an established name.
    } finally {
      clearTimeout(timeout);
      for (const document of job.documents) closeDocument(document);
      if (active === job) active = null;
      if (!closed) {
        const requested = pending;
        pending = false;
        let retryDelay = retryMs;
        if (retry && attemptedOwned && job.generation === generation) {
          failedOwnedAttempts = Math.min(32, failedOwnedAttempts + 1);
          retryDelay = Math.min(PROFILE_REFRESH_MS, Math.max(1, retryMs) * 2 ** (failedOwnedAttempts - 1));
        } else if (!retry) failedOwnedAttempts = 0;
        schedule(requested ? settleMs : retry ? retryDelay : usedOwnedRoot ? PROFILE_REFRESH_MS : intervalMs);
      }
    }
  };
  return {
    start() { if (!started && !closed) { started = true; schedule(settleMs); } },
    request,
    invalidate,
    close() {
      if (closed) return;
      closed = true;
      generation++;
      clearTimeout(timer);
      active?.controller.abort();
      profile = null;
    },
    snapshot() { return profile ? {...profile} : null; },
  };
}
