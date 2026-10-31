import {META_APPS} from '../src/shared/meta-apps.mjs';
// Only destinations verified on the official services belong here. Personal
// website authentication is independent of the locally installed Muse CLI.
const destinations = Object.freeze({
  bot: 'https://muse.ai/',
  chat: 'https://www.meta.ai/',
  ideas: 'https://muse.ai/ideas',
  goals: 'https://muse.ai/goals',
});
// Facebook, Instagram and auth.meta.com were observed in Muse's fresh-session Meta account
// sign-in redirects. These are exact origin allowances, not subdomain wildcards.
const hosts = new Set(['muse.ai', 'auth.muse.ai', 'www.meta.ai', 'meta.ai', 'www.facebook.com', 'www.instagram.com', 'auth.meta.com', 'auth.meta.ai']);
const authenticationHosts = new Set(['auth.muse.ai', 'www.facebook.com', 'www.instagram.com', 'auth.meta.com', 'auth.meta.ai']);
const commands = new Set(['prewarm', 'layout', 'navigate', 'back', 'forward', 'reload', 'openExternal', 'openNoticeExternal', 'presentation', 'appearance', 'serviceAction', 'metaAction', 'metaSettings', 'metaApps', 'scheduleAction', 'dismissNotice', 'refreshLibrary', 'selectItem', 'newMuseChat']);
const warmTargets = new Set(['bot', 'ideas', 'goals', 'muse-search', 'muse-feed', 'muse-library', 'meta-chat', 'meta-search', 'meta-media', 'meta-artifacts', 'meta-scheduled', 'meta-vibes']);
const serviceActions = new Set(['search', 'feed', 'library', 'settings', 'connections', 'whatsapp']);
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function personalTarget(destination) { return owns(destinations, destination) ? destinations[destination] : null; }
export function personalService(destination) { return destination === 'chat' ? 'chat' : 'muse'; }
export function personalAvailability() { return Object.fromEntries(Object.entries(destinations).map(([key, value]) => [key, Boolean(value)])); }
export function allowedPersonalURL(value) {
  if (typeof value !== 'string' || value.length > 16384) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.has(url.hostname);
  } catch { return false; }
}
export function personalOrigin(value) { return allowedPersonalURL(value) ? new URL(value).origin : null; }
export function personalAuthenticating(value) { return allowedPersonalURL(value) && authenticationHosts.has(new URL(value).hostname); }
// Accounts Center is a separate official account/plan destination. Keep it out
// of the chat-view allowlist: it belongs in an isolated owned account window.
export function allowedPersonalAccountURL(value) {
  if (allowedPersonalURL(value)) return true;
  if (typeof value !== 'string' || value.length > 16384) return false;
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.hostname==='accountscenter.meta.com'; } catch { return false; }
}
export function personalAccountOrigin(value) { return allowedPersonalAccountURL(value) ? new URL(value).origin : null; }
export function allowedPersonalPopupURL(value, opener) {
  // The service may reserve a blank window synchronously, then navigate it
  // after loading its account flow. It inherits only the sandboxed remote view.
  return allowedPersonalAccountURL(opener) && (value === 'about:blank' || allowedPersonalAccountURL(value));
}
export function personalAccountNotice(value, service = 'chat') {
  try { if(new URL(value).hostname==='accounts.google.com')return `Google requires sign-in in your browser. Open ${service==='chat'?'Meta AI':'Muse'} there, connect the app in ${service==='chat'?'Settings → Apps':'Settings → Connectors'} using the same Meta account, then return and refresh.`; } catch { /* No remote URL is included in UI or logs. */ }
  return 'This account step needs your browser. Open the official service there, finish the step using the same Meta account, then return and refresh.';
}
export function personalRoute(value) {
  if (!allowedPersonalURL(value)) return null;
  const url = new URL(value);
  if (url.hostname === 'meta.ai' || url.hostname === 'www.meta.ai') return 'chat';
  if (url.hostname !== 'muse.ai') return null;
  if (url.pathname === '/' || /^\/thread\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname)) return 'bot';
  for (const section of ['ideas', 'goals']) if (url.pathname === `/${section}` || url.pathname.startsWith(`/${section}/`)) return section;
  return null;
}

export function validatePersonalCommand(command) {
  const fail = () => { throw Error('Invalid personal Muse command.'); };
  if (!object(command) || !commands.has(command.type)) fail();
  const fields = command.type === 'metaApps' ? (command.action==='connect'?['type','action','appId']:['type','action']) : command.type === 'metaSettings' ? ['type','section'] : command.type === 'prewarm' ? ['type', 'target'] : command.type === 'scheduleAction' ? ['type','action','id'] : command.type === 'layout' ? ['type', 'visible', 'bounds'] : command.type === 'navigate' ? ['type', 'destination'] : command.type === 'presentation' ? ['type', 'compact'] : command.type === 'appearance' ? ['type', 'appearance'] : ['serviceAction','metaAction'].includes(command.type) ? ['type', 'action'] : command.type === 'selectItem' ? ['type', 'id'] : ['type'];
  if (Object.keys(command).some(key => !fields.includes(key))) fail();
  if (command.type === 'prewarm' && !warmTargets.has(command.target)) fail();
  if (command.type === 'navigate' && !owns(destinations, command.destination)) fail();
  if (command.type === 'presentation' && typeof command.compact !== 'boolean') fail();
  if (command.type === 'appearance') {
    const value = command.appearance;
    if (!object(value) || Object.keys(value).length !== 4 || Object.keys(value).some(key => !['theme', 'textSize', 'font', 'reducedMotion'].includes(key))) fail();
    if (!['dark', 'light'].includes(value.theme) || !['small', 'medium', 'large'].includes(value.textSize) || !['system', 'mono'].includes(value.font) || typeof value.reducedMotion !== 'boolean') fail();
  }
  if(command.type==='scheduleAction'&&(!['edit','options','new'].includes(command.action)||(command.action!=='new'&&!/^[a-f0-9]{24}$/.test(command.id))))fail();
  if(command.type==='metaAction'&&!['newChat','search','media','artifacts','scheduled','vibes'].includes(command.action))fail();
  if(command.type==='metaApps'&&(!['refresh','connect'].includes(command.action)||(command.action==='connect'&&!META_APPS.some(app=>app.id===command.appId))))fail();
  if(command.type==='metaSettings'&&!['general','apps'].includes(command.section))fail();
  if (command.type === 'serviceAction' && !serviceActions.has(command.action)) fail();
  if (command.type === 'selectItem' && (typeof command.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(command.id))) fail();
  if (command.type === 'layout') {
    if (typeof command.visible !== 'boolean' || (command.visible && !command.bounds)) fail();
    if (command.bounds !== undefined) {
      const bounds = command.bounds;
      if (!object(bounds) || Object.keys(bounds).length !== 4 || Object.keys(bounds).some(key => !['x', 'y', 'width', 'height'].includes(key))) fail();
      for (const key of ['x', 'y', 'width', 'height']) if (typeof bounds[key] !== 'number' || !Number.isFinite(bounds[key]) || Math.abs(bounds[key]) > 100000) fail();
      if (bounds.width < 0 || bounds.height < 0) fail();
    }
  }
  return structuredClone(command);
}

export function clampPersonalBounds(bounds, zoomFactor, contentSize) {
  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  const [width, height] = contentSize.map(value => Math.max(0, Math.round(value)));
  const clamp = (value, maximum) => Math.max(0, Math.min(maximum, Math.round(value * zoom)));
  const x = clamp(bounds.x, width), y = clamp(bounds.y, height);
  const right = clamp(bounds.x + bounds.width, width), bottom = clamp(bounds.y + bounds.height, height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
