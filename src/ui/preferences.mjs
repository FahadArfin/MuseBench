import {REASONING_LEVELS,APPROVAL_MODES} from '../shared/run-options.mjs';
export const PREFERENCES_KEY = 'musebench.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'dark',
  textSize: 'medium',
  font: 'system',
  reducedMotion: false,
  enterToSend: false,
  sidebarCollapsed: false,
  transcriptWidth: 'narrow',
  defaultReasoning: 'high',
  defaultApproval: 'ask',
  notifyCompletion: false,
  notifyAttention: false,
  notificationSound: false,
});

export function normalizePreferences(value) {
  const preferences = {...DEFAULT_PREFERENCES};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return preferences;
  for (const [key, allowed] of Object.entries({theme:['dark','light','system'],textSize:['small','medium','large'],font:['system','mono'],transcriptWidth:['narrow','wide'],defaultReasoning:REASONING_LEVELS,defaultApproval:APPROVAL_MODES})) {
    if (Object.hasOwn(value,key) && allowed.includes(value[key])) preferences[key] = value[key];
  }
  for (const key of ['reducedMotion','enterToSend','sidebarCollapsed','notifyCompletion','notifyAttention','notificationSound']) {
    if (Object.hasOwn(value,key) && typeof value[key] === 'boolean') preferences[key] = value[key];
  }
  return preferences;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function readPreferences(storage = browserStorage()) {
  try { return normalizePreferences(JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? 'null')); }
  catch { return {...DEFAULT_PREFERENCES}; }
}

export function writePreferences(preferences, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(PREFERENCES_KEY,JSON.stringify(normalizePreferences(preferences)));
    return true;
  } catch { return false; }
}

export function resolveTheme(theme, systemDark) {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}
