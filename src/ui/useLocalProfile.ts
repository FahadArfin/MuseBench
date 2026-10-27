import {useState} from 'react';
import type {AccountProfile} from '../shared/types';

export function useLocalProfile(account?: AccountProfile | null) {
  const key = `musebench-profile:${account?.sample ? 'sample' : 'account'}:${account?.avatarSeed || account?.displayName || 'local'}`;
  const [overrides, setOverrides] = useState<Record<string, Partial<AccountProfile>>>({});
  let saved: Partial<AccountProfile> = overrides[key] || {};
  if (!(key in overrides)) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      for (const field of ['displayName', 'handle', 'bio', 'avatarSeed'] as const) {
        if (typeof value?.[field] === 'string') saved[field] = value[field].slice(0, 240);
      }
      if(typeof value?.avatarImage==='string'&&value.avatarImage.length<500000&&/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.avatarImage))saved.avatarImage=value.avatarImage;
      if(value?.setupComplete===true)saved.setupComplete=true;
    } catch { /* An unreadable local preference does not block the profile. */ }
  }
  const profile: AccountProfile = {displayName: 'Your account', ...account, ...saved};
  const save = (next: Pick<AccountProfile, 'displayName' | 'handle' | 'bio' | 'avatarSeed' | 'avatarImage' | 'setupComplete'>) => {
    localStorage.setItem(key, JSON.stringify(next));
    setOverrides(previous => ({...previous, [key]: next}));
  };
  return {profile, save};
}
