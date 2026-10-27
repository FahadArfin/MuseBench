import type {CatalogEntry,CatalogPage,CatalogSearch} from './extension-catalog-types';
export const CURATED_EXTENSIONS:CatalogEntry[];
export function searchCuratedExtensions(search?:CatalogSearch):CatalogPage;
