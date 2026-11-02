import {REASONING_LEVELS,APPROVAL_MODES} from '../shared/run-options.mjs';
export const PREFERENCES_KEY = 'musebench.preferences.v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'dark',
  textSize: 'medium',
  font: 'system',
  reducedMotion: false,
  enterToSend: true,
  autoPreviewFiles: true,
  showPredictions: true,
  musePredictions: false,
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
  for (const key of ['autoPreviewFiles','showPredictions','musePredictions','reducedMotion','enterToSend','sidebarCollapsed','notifyCompletion','notifyAttention','notificationSound']) {
    if (Object.hasOwn(value,key) && typeof value[key] === 'boolean') preferences[key] = value[key];
  }
  return preferences;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function readPreferences(storage = browserStorage()) {
  try {
    const saved = JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? 'null');
    const preferences = normalizePreferences(saved);
    // Earlier releases persisted the old newline default. Upgrade it once;
    // writes below mark subsequent explicit opt-outs as intentional.
    if (saved?.enterToSendVersion !== 1) preferences.enterToSend = true;
    return preferences;
  }
  catch { return {...DEFAULT_PREFERENCES}; }
}

export function writePreferences(preferences, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(PREFERENCES_KEY,JSON.stringify({...normalizePreferences(preferences),enterToSendVersion:1}));
    return true;
  } catch { return false; }
}

export function resolveTheme(theme, systemDark) {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}
