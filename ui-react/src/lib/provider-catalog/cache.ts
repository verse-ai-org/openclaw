/**
 * localStorage cache for the provider catalog delivered by bossim-service.
 * Stores the last successful payload plus its ETag/version for conditional
 * (304) revalidation and offline fallback.
 */

import {
  providerCatalogSchema,
  type ProviderCatalog,
} from "@/data/provider-catalog.types";

const CACHE_KEY = "bossim.provider-catalog.v1";

export type CachedCatalog = {
  etag: string | null;
  version: number;
  catalog: ProviderCatalog;
};

export function readCachedCatalog(): CachedCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      etag?: unknown;
      version?: unknown;
      catalog?: unknown;
    };
    const catalog = providerCatalogSchema.safeParse(parsed.catalog);
    if (!catalog.success) {
      return null;
    }
    return {
      etag: typeof parsed.etag === "string" ? parsed.etag : null,
      version: typeof parsed.version === "number" ? parsed.version : 0,
      catalog: catalog.data,
    };
  } catch {
    return null;
  }
}

export function writeCachedCatalog(entry: CachedCatalog): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Best-effort; ignore quota / unavailable storage.
  }
}

export function clearCachedCatalog(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
