import type {AccountProfile} from '../shared/types';
export type LocalProfileOverrides = Partial<Pick<AccountProfile,'displayName'|'handle'|'bio'|'avatarSeed'|'avatarImage'|'setupComplete'>>;
type ProfileStorage = Pick<Storage,'getItem'|'setItem'>;
export function profileStorageKey(account?: AccountProfile | null): string;
export function readProfileOverrides(account?: AccountProfile | null, storage?: Pick<Storage,'getItem'> | null): LocalProfileOverrides;
export function migrateLocalProfile(account?: AccountProfile | null, storage?: ProfileStorage | null): boolean;
export function resolveLocalProfile(account: AccountProfile | null | undefined, overrides: LocalProfileOverrides): AccountProfile;
export function writeLocalProfile(account: AccountProfile | null | undefined, next: LocalProfileOverrides, storage?: ProfileStorage | null): LocalProfileOverrides;
