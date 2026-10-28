import {useEffect,useMemo,useRef,useState} from 'react';
import type {AccountProfile} from '../shared/types';
import {migrateLocalProfile,profileStorageKey,readProfileOverrides,resolveLocalProfile,writeLocalProfile,type LocalProfileOverrides} from './local-profile.mjs';

export function useLocalProfile(account?: AccountProfile | null) {
  const key = profileStorageKey(account), currentKey = useRef(key);
  const [revision,refresh] = useState(0);
  currentKey.current = key;
  useEffect(() => {
    if (migrateLocalProfile(account)) refresh(value => value + 1);
  },[key]);
  // Avatar data can be large. Do not parse local storage on every streamed
  // chat update; account changes and explicit profile saves invalidate it.
  const overrides = useMemo(() => readProfileOverrides(account),[key,revision]);
  const profile = useMemo(() => resolveLocalProfile(account,overrides),[account,overrides]);
  const save = (next: LocalProfileOverrides) => {
    if (currentKey.current !== key) throw Error('The account changed. Reopen the profile editor.');
    writeLocalProfile(account,next);
    refresh(value => value + 1);
  };
  return {profile,save,key};
}
