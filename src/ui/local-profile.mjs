const legacyKey = 'musebench-profile:account:local';
const localKey = 'musebench-profile:v2:local';
const migrationOwnerKey = 'musebench-profile:v2:legacy-owner';

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function profileStorageKey(account) {
  if (account?.sample) return `musebench-profile:sample:${account.avatarSeed || account.displayName || 'local'}`;
  if (account?.accountId) return `musebench-profile:v2:account:${encodeURIComponent(account.accountId)}`;
  if (account) return `musebench-profile:account:${account.avatarSeed || account.displayName || 'local'}`;
  return localKey;
}

function normalizeOverrides(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const field of ['displayName','handle','bio','avatarSeed']) {
    if (Object.hasOwn(value,field) && typeof value[field] === 'string') result[field] = value[field].slice(0,240);
  }
  if (typeof result.displayName === 'string') {
    result.displayName = result.displayName.trim();
    if (!result.displayName || result.displayName === 'Your account') delete result.displayName;
  }
  if (Object.hasOwn(value,'avatarImage') && typeof value.avatarImage === 'string' && value.avatarImage.length < 500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.avatarImage)) result.avatarImage = value.avatarImage;
  if (Object.hasOwn(value,'setupComplete') && value.setupComplete === true) result.setupComplete = true;
  return result;
}

function parseOverrides(raw) {
  try { return normalizeOverrides(JSON.parse(raw || '{}')); } catch { return {}; }
}

export function readProfileOverrides(account, storage = browserStorage()) {
  try {
    const key = profileStorageKey(account), raw = storage?.getItem(key);
    if (raw != null) return parseOverrides(raw);
    const owner = storage?.getItem(migrationOwnerKey);
    if ((!account && owner == null) || (!account?.sample && account?.accountId && owner === key)) return parseOverrides(storage?.getItem(legacyKey));
  } catch { /* A local preference cannot hide the authenticated account name. */ }
  return {};
}

export function migrateLocalProfile(account, storage = browserStorage()) {
  if (!account?.accountId || account.sample || !storage) return false;
  let changed = false;
  try {
    const key = profileStorageKey(account), owner = storage.getItem(migrationOwnerKey);
    if (owner != null && owner !== key) return false;
    // Reserve the old device profile before copying, so a failed write cannot
    // make another signed-in account inherit it. Keep the original as a backup.
    if (owner == null) { storage.setItem(migrationOwnerKey,key); changed = true; }
    if (storage.getItem(key) == null) {
      const legacy = storage.getItem(legacyKey);
      if (legacy != null) { storage.setItem(key,JSON.stringify(parseOverrides(legacy))); changed = true; }
    }
  } catch { /* The original profile remains readable by its migration owner. */ }
  return changed;
}

export function resolveLocalProfile(account, overrides) {
  const displayName = account?.accountName?.trim() || account?.displayName?.trim() || 'Your account';
  return {...account,displayName,...normalizeOverrides(overrides)};
}

export function writeLocalProfile(account, next, storage = browserStorage()) {
  if (!storage) throw Error('Profile storage is unavailable.');
  const overrides = normalizeOverrides(next), defaults = resolveLocalProfile(account,{});
  for (const field of Object.keys(overrides)) {
    if (overrides[field] === defaults[field]) delete overrides[field];
  }
  const key = !account && storage.getItem(migrationOwnerKey) == null ? legacyKey : profileStorageKey(account);
  storage.setItem(key,JSON.stringify(overrides));
  return overrides;
}
