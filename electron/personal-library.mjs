// A bounded adapter for rendered collection/navigation UI, not a consumer API.
// Only user-requested titles and navigation targets cross into main memory.
const sections = new Set(['chats', 'ideas', 'goals']);
const empty = status => ({ status, items: [], selectedKey: null, selectionKnown: false });
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
function onMuse(contents) {
  try { const url = new URL(contents.getURL()); return !contents.isDestroyed() && url.origin === 'https://muse.ai' && !url.username && !url.password; }
  catch { return false; }
}
function targetFor(section, item) {
  const target = item?.target;
  if (!target || !sections.has(section)) return null;
  if (section === 'chats' && target.type === 'main' && target.value === '/') return { type:'main', value:'/' };
  if (target.type === 'title' && section !== 'chats') {
    const value = clean(target.value);
    return value && value.length <= 240 && value === clean(item.title) ? {type:'title',value} : null;
  }
  if (target.type !== 'link' || typeof target.value !== 'string' || target.value.length > 300 || target.value.includes('%') || target.value.includes('\\') || target.value.includes('..') || target.value.startsWith('//')) return null;
  try {
    const url = new URL(target.value, 'https://muse.ai');
    const prefix = section === 'chats' ? 'thread' : section;
    if (url.origin !== 'https://muse.ai' || url.username || url.password || url.search || url.hash || !new RegExp(`^/${prefix}/[A-Za-z0-9_-]{1,160}$`).test(url.pathname) || url.pathname === '/thread/new') return null;
    return { type:'link', value:url.pathname };
  } catch { return null; }
}
export function normalizePersonalCollection(section, value) {
  if (!sections.has(section) || !value || !['ready','loading','unavailable','signed-out'].includes(value.status)) return empty('unavailable');
  if (value.status !== 'ready') return empty(value.status);
  const candidates = [], counts = new Map();
  for (const item of Array.isArray(value.items) ? value.items.slice(0, 250) : []) {
    const title = clean(item?.title), target = targetFor(section,item);
    if (!title || title.length > 240 || !target) continue;
    const key = target.type === 'main' ? 'main' : `${target.type}:${target.value}`;
    counts.set(key,(counts.get(key) ?? 0)+1); candidates.push({key,title,target});
  }
  const items = candidates.filter(item => counts.get(item.key) === 1).slice(0,100);
  return {status:'ready',items,selectedKey:items.some(item=>item.key === value.selectedKey) ? value.selectedKey : null,selectionKnown:value.selectionKnown === true};
}

// This function is serialized into the isolated official document. It reads
// collection headings/links only; it never accesses message containers, page
// framework internals, cookies, storage, or network responses.
function collectionDOM(section) {
  const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim() : '';
  const empty = status => ({status,items:[],selectedKey:null,selectionKnown:false});
  if (location.origin !== 'https://muse.ai') return empty('unavailable');
  if (!document.querySelector('[data-hatch-dock]')) return empty(document.querySelector('input[type="password"],form[action*="login"]') ? 'signed-out' : 'loading');
  if (section === 'chats') {
    if (location.pathname !== '/' && !/^\/thread\/[A-Za-z0-9_-]+$/.test(location.pathname)) return empty('unavailable');
    const nav = document.querySelector('nav[aria-label="Side chats"]');
    if (!nav || /Loading side chats/i.test(nav.textContent ?? '')) return empty('loading');
    const items = [{title:'Main conversation',target:{type:'main',value:'/'}}];
    for (const anchor of Array.from(nav.querySelectorAll('a[href]')).slice(0,150)) {
      const href = anchor.getAttribute('href');
      if (href === '/' || href === 'https://muse.ai/') continue;
      const title = clean(anchor.getAttribute('aria-label') || anchor.getAttribute('title') || anchor.querySelector('[title]')?.getAttribute('title') || anchor.textContent);
      items.push({title,target:{type:'link',value:href}});
    }
    return {status:'ready',items,selectedKey:location.pathname === '/' ? 'main' : `link:${location.pathname}`,selectionKnown:true};
  }
  if (location.pathname !== `/${section}` && !location.pathname.startsWith(`/${section}/`)) return empty('unavailable');
  const name = section === 'ideas' ? 'Ideas' : 'Goals';
  const heading = Array.from(document.querySelectorAll('h1')).find(e=>e.textContent?.trim() === name);
  const scope = heading?.closest('header')?.parentElement;
  if (!scope || new RegExp(`Loading ${section}`,'i').test(scope.textContent ?? '')) return empty('loading');
  const items = [];
  const controls = section === 'ideas' ? scope.querySelectorAll('button[data-pel-click="idea_group_row_click"],a[href]') : scope.querySelectorAll('button:has(h3),a[href]:has(h3)');
  for (const control of Array.from(controls).slice(0,150)) {
    const title = clean(control.querySelector('h3')?.textContent);
    if (!title) continue;
    items.push({title,target:control.tagName === 'A' ? {type:'link',value:control.getAttribute('href')} : {type:'title',value:title}});
  }
  if (!items.length && section === 'goals' && !scope.querySelector('#hatch-goals-create')) return empty('unavailable');
  if (!items.length && section === 'ideas' && !/No ideas|Ideas will appear/i.test(scope.textContent ?? '')) return empty('unavailable');
  const openTitles = Array.from(document.querySelectorAll('[data-pel-impression="idea_preview_dialog_impression"] h2,[role="dialog"] h2')).filter(h=>h.getClientRects().length > 0).map(h=>clean(h.textContent));
  const selected = items.find(item=>item.target.type === 'title' ? openTitles.includes(item.title) : item.target.value === location.pathname);
  // Ideas expose a visible preview heading, so its absence reliably means the
  // preview was closed. Button-based goal previews have no verified marker.
  const selectionKnown = section === 'ideas' || items.every(item=>item.target.type === 'link');
  return {status:'ready',items,selectedKey:selected ? `${selected.target.type}:${selected.target.value}` : null,selectionKnown};
}
export async function readPersonalCollection(contents, section) {
  if (!sections.has(section) || !onMuse(contents)) return empty('unavailable');
  try { return normalizePersonalCollection(section,await contents.executeJavaScript(`(${collectionDOM.toString()})(${JSON.stringify(section)})`)); }
  catch { return empty('unavailable'); }
}

export async function preparePersonalCollection(contents, section) {
  if (!sections.has(section) || !onMuse(contents)) return false;
  if (section !== 'chats') return true;
  try {
    return await contents.executeJavaScript(`(${async function() {
      const deadline = Date.now()+5000; let nextAttempt = 0;
      while (location.origin === 'https://muse.ai' && Date.now()<deadline) {
        if (document.querySelector('nav[aria-label="Side chats"]')) return true;
        if (location.pathname !== '/') return false;
        const trigger = document.querySelector('[data-testid="hatch-chat-switcher-trigger"]');
        if (trigger && document.readyState === 'complete' && Date.now()>=nextAttempt) { trigger.click(); nextAttempt=Date.now()+500; }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      return false;
    }.toString()})()`,true) === true;
  } catch { return false; }
}

export async function activatePersonalItem(contents, section, item) {
  const target = targetFor(section,item), title = clean(item?.title);
  if (!onMuse(contents) || !target || !title || title.length>240) return false;
  if (section === 'chats' && target.type !== 'main') await preparePersonalCollection(contents,section);
  try {
    return await contents.executeJavaScript(`(${function({section,target,title}) {
      if (location.origin !== 'https://muse.ai') return false;
      const clean = value => (value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
      let controls=[];
      if (section === 'chats') {
        if (location.pathname === target.value) return true;
        if (target.type === 'main') controls=Array.from(document.querySelectorAll('a[data-testid="hatch-nav-chat"]')).filter(e=>e.getAttribute('href') === '/');
        else controls=Array.from(document.querySelectorAll('nav[aria-label="Side chats"] a[href]')).filter(e=> {
          try {const url=new URL(e.getAttribute('href'),location.origin);return url.origin===location.origin && !url.search && !url.hash && url.pathname===target.value;}catch{return false;}
        });
      } else {
        if (location.pathname !== `/${section}` && !location.pathname.startsWith(`/${section}/`)) return false;
        const name = section === 'ideas' ? 'Ideas' : 'Goals';
        const heading=Array.from(document.querySelectorAll('h1')).find(e=>e.textContent?.trim()===name);
        const scope=heading?.closest('header')?.parentElement;
        if (!scope) return false;
        const selector=section==='ideas'?'button[data-pel-click="idea_group_row_click"],a[href]':'button:has(h3),a[href]:has(h3)';
        controls=Array.from(scope.querySelectorAll(selector)).filter(e=> {
          if (clean(e.querySelector('h3')?.textContent)!==title) return false;
          if (target.type==='title') return e.tagName==='BUTTON';
          try {const url=new URL(e.getAttribute('href'),location.origin);return url.origin===location.origin && !url.search && !url.hash && url.pathname===target.value;}catch{return false;}
        });
      }
      if (controls.length!==1) return false;
      controls[0].click(); return true;
    }.toString()})(${JSON.stringify({section,target,title})})`,true) === true;
  } catch { return false; }
}
