export interface Preferences {
  theme: 'dark' | 'light' | 'system';
  textSize: 'small' | 'medium' | 'large';
  font: 'system' | 'mono';
  reducedMotion: boolean;
  enterToSend: boolean;
  sidebarCollapsed: boolean;
  transcriptWidth: 'narrow' | 'wide';
  defaultReasoning: import('../shared/types').RunOptions['reasoning'];
  defaultApproval: import('../shared/types').RunOptions['approval'];
  notifyCompletion: boolean;
  notifyAttention: boolean;
  notificationSound: boolean;
}
export const PREFERENCES_KEY: string;
export const DEFAULT_PREFERENCES: Readonly<Preferences>;
export function normalizePreferences(value: unknown): Preferences;
export function readPreferences(storage?: Pick<Storage,'getItem'> | null): Preferences;
export function writePreferences(preferences: Preferences, storage?: Pick<Storage,'setItem'> | null): boolean;
export function resolveTheme(theme: Preferences['theme'], systemDark: boolean): 'dark' | 'light';
