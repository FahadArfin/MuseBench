export type ExtensionKind = 'skills' | 'plugins' | 'mcp' | 'connectors' | 'hooks';
export type CatalogSource = 'recommended' | 'community';
export interface CatalogEntry {
  id: string; title: string; description: string; kind: ExtensionKind; source: CatalogSource;
  publisher: string; homepage: string; tags: string[];
  category?: string; icon?: string; popular?: boolean; summary?: string;
  compatibility: 'recipe' | 'unverified' | 'setup-required' | 'template';
  setup: string;
  package?: { repo: string; ref?: string; path: string; kind: 'skill' | 'plugin' };
  recipe?: { name: string; transport: 'http'; url: string; oauth?: boolean } | {name:string;transport:'npm';package:string;version:string};
  hook?: { event: 'Stop' | 'UserPromptSubmit'; command: string };
  provenance: { source: string; url: string; ref?: string; version?: string };
  fetchedAt?: string;
}
export interface CatalogSearch { kind: ExtensionKind; query?: string; source?: CatalogSource; cursor?: string; refresh?: boolean }
export interface CatalogPage { entries: CatalogEntry[]; nextCursor: string | null; stale: boolean; offline: boolean; fetchedAt: string | null; errors: string[]; disclosure: string }
