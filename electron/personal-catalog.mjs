import { randomUUID } from 'node:crypto';

const kinds = Object.freeze({ chats: 'chat', ideas: 'idea', goals: 'goal' });
const sections = Object.keys(kinds);
const displayText = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : '';
function targetFor(section, target) {
  if (!target || typeof target !== 'object' || typeof target.value !== 'string' || target.value.length > 2048) return null;
  if (target.type === 'main') return section === 'chats' && target.value === '/' ? { type: 'main', value: '/' } : null;
  if (target.type === 'title') {
    const value = displayText(target.value);
    return section !== 'chats' && value ? { type: 'title', value } : null;
  }
  if (target.type !== 'link' || (!target.value.startsWith('/') && !target.value.startsWith('https://muse.ai/')) || target.value.startsWith('//') || /[\\\s]/.test(target.value)) return null;
  try {
    const url = new URL(target.value, 'https://muse.ai');
    const prefix = section === 'chats' ? 'thread' : section;
    if (url.origin !== 'https://muse.ai' || url.username || url.password || url.search || url.hash || !new RegExp(`^/${prefix}/[A-Za-z0-9_-]{1,200}$`).test(url.pathname) || url.pathname === '/thread/new') return null;
    return { type: 'link', value: url.pathname };
  } catch { return null; }
}

// Only display metadata leaves this memory-only catalog. The renderer receives
// opaque IDs; every actionable navigation target stays in the main process.
export function createPersonalCatalog({now = Date.now} = {}) {
  const groups = new Map(sections.map(section => [section, { status: 'idle', items: [] }]));
  const records = new Map();
  const pending = new Map();
  let selectedId = null;
  function snapshot() {
    return { ...Object.fromEntries([...groups].map(([section, group]) => [section, { status: group.status, items: group.items.map(({ id, title, target }) => ({ id, title, kind: kinds[section], ...(target.type==='main'?{main:true}:{}) })) }])), selectedId };
  }
  function reset(status = 'idle') {
    records.clear(); pending.clear(); selectedId = null;
    for (const section of sections) groups.set(section, { status: status === 'signed-out' ? 'signed-out' : 'idle', items: [] });
  }
  function update(section, result, active = false, {loadingKey = null, retry = false} = {}) {
    if (!groups.has(section)) return;
    const old = groups.get(section);
    if (result?.status !== 'ready') {
      let status = old.status === 'signed-out' && !retry ? 'signed-out' : 'unavailable';
      if (result?.status === 'loading') {
        const previous = pending.get(section);
        const attempt = retry || !previous || previous.key !== loadingKey ? {key:loadingKey,startedAt:now()} : previous;
        pending.set(section,attempt);
        // Polling a stalled service must not repeatedly replace an actionable
        // failure/sign-in state with another spinner. Explicit retries may.
        status = old.status === 'ready' || (!retry && ['unavailable','signed-out'].includes(old.status))
          ? old.status : now()-attempt.startedAt >= 15000 ? 'unavailable' : 'loading';
      } else { pending.delete(section); }
      groups.set(section, { ...old, status });
      return;
    }
    pending.delete(section);
    const candidates = Array.isArray(result.items) ? result.items.slice(0, 500) : [];
    const counts = new Map();
    for (const item of candidates) if (typeof item?.key === 'string') counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
    const previous = new Map(old.items.map(item => [item.key, item]));
    const items = [];
    for (const raw of candidates) {
      if (items.length >= 100) break;
      if (typeof raw?.key !== 'string' || !raw.key || raw.key.length > 2048 || counts.get(raw.key) !== 1) continue;
      const title = displayText(raw.title), target = targetFor(section, raw.target);
      if (!title || !target) continue;
      const prior = previous.get(raw.key);
      const id = prior && JSON.stringify(prior.target) === JSON.stringify(target) ? prior.id : randomUUID();
      items.push({ id, section, key: raw.key, title, target });
    }
    for (const item of old.items) records.delete(item.id);
    for (const item of items) records.set(item.id, item);
    groups.set(section, { status: 'ready', items });
    if (selectedId && !records.has(selectedId)) selectedId = null;
    if (active) selectedId = items.find(item => item.key === result.selectedKey)?.id ?? null;
  }
  return { snapshot, update, reset,
    get: id => records.has(id) ? structuredClone(records.get(id)) : null,
    select: id => { selectedId = records.has(id) ? id : null; },
  };
}
