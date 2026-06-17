/**
 * provider-catalog.store.ts
 *
 * Single runtime source of the provider catalog for Setup and Settings.
 * Decouples consumers from the static auth-choice-groups module so the catalog
 * can be delivered dynamically by bossim-service.
 *
 * Three-layer fallback: remote (bossim-service) -> localStorage cache ->
 * built-in snapshot (BUILTIN_PROVIDER_CATALOG). The built-in value is the
 * initial state, so Setup works instantly and offline.
 *
 * Use the reactive hooks (useProviderGroups, useFeaturedProviders, ...) inside
 * components; use the plain helpers (findProviderGroup, providerEmoji, ...) for
 * one-off lookups within already-reactive render paths or non-component code.
 */

import { create } from "zustand";
import {
  BUILTIN_PROVIDER_CATALOG,
  PROVIDER_LOGO,
  type AuthMethodDef,
  type AuthProviderGroupDef,
} from "@/data/auth-choice-groups";
import type { ProviderCatalog } from "@/data/provider-catalog.types";
import { fetchProviderCatalog } from "@/lib/provider-catalog/client";
import {
  readCachedCatalog,
  writeCachedCatalog,
} from "@/lib/provider-catalog/cache";

export type CatalogSource = "builtin" | "cache" | "remote" | "loading";

interface ProviderCatalogState {
  catalog: ProviderCatalog;
  source: CatalogSource;
  version: number;
  etag: string | null;
  lastError: string | null;
  initialized: boolean;
  /** First-time init: hydrate from cache, then background-refresh from remote. */
  init: () => Promise<void>;
  /** Re-fetch from remote. Pass force to ignore the ETag and always re-pull. */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
}

export const useProviderCatalogStore = create<ProviderCatalogState>(
  (set, get) => ({
    catalog: BUILTIN_PROVIDER_CATALOG,
    source: "builtin",
    version: 0,
    etag: null,
    lastError: null,
    initialized: false,

    init: async () => {
      if (get().initialized) {
        return;
      }
      set({ initialized: true });
      const cached = readCachedCatalog();
      if (cached) {
        set({
          catalog: cached.catalog,
          source: "cache",
          version: cached.version,
          etag: cached.etag,
        });
      }
      await get().refresh();
    },

    refresh: async (opts) => {
      const etag = opts?.force ? null : get().etag;
      set({ source: "loading" });
      const result = await fetchProviderCatalog({ etag });

      if (result.status === "ok") {
        set({
          catalog: result.catalog,
          source: "remote",
          version: result.version,
          etag: result.etag,
          lastError: null,
        });
        writeCachedCatalog({
          etag: result.etag,
          version: result.version,
          catalog: result.catalog,
        });
        return;
      }

      if (result.status === "not-modified") {
        set({ source: "remote", lastError: null });
        return;
      }

      // Error: keep whatever catalog we already have (cache or built-in).
      set({
        source: get().version > 0 ? "cache" : "builtin",
        lastError: result.error,
      });
    },
  }),
);

// ── Reactive hooks (subscribe to catalog changes) ───────────────────────────

export function useProviderCatalog(): ProviderCatalog {
  return useProviderCatalogStore((s) => s.catalog);
}

export function useProviderGroups(): AuthProviderGroupDef[] {
  return useProviderCatalogStore((s) => s.catalog.groups);
}

export function useFeaturedProviders(): AuthProviderGroupDef[] {
  return useProviderCatalogStore((s) =>
    s.catalog.groups.filter((g) => g.featured),
  );
}

// ── Plain helpers (read current catalog; drop-in for the old static fns) ─────

function currentGroups(): AuthProviderGroupDef[] {
  return useProviderCatalogStore.getState().catalog.groups;
}

export function findProviderGroup(
  id: string,
  groups: AuthProviderGroupDef[] = currentGroups(),
): AuthProviderGroupDef | undefined {
  return groups.find((g) => g.id === id);
}

export function findAuthMethod(
  methodId: string,
  groups: AuthProviderGroupDef[] = currentGroups(),
): AuthMethodDef | undefined {
  for (const group of groups) {
    const method = group.methods.find((m) => m.id === methodId);
    if (method) {
      return method;
    }
  }
  return undefined;
}

export function getFeaturedProviders(
  groups: AuthProviderGroupDef[] = currentGroups(),
): AuthProviderGroupDef[] {
  return groups.filter((g) => g.featured);
}

export function findProviderGroupForMethod(
  methodId: string,
  groups: AuthProviderGroupDef[] = currentGroups(),
): AuthProviderGroupDef | undefined {
  return groups.find((g) => g.methods.some((m) => m.id === methodId));
}

export function providerEmoji(id: string): string {
  return useProviderCatalogStore.getState().catalog.emoji[id] ?? "";
}

/** Logos are bundled assets resolved client-side, not part of the payload. */
export function providerLogo(id: string): string | undefined {
  return PROVIDER_LOGO[id];
}

export function modelCandidates(id: string): string[] {
  return useProviderCatalogStore.getState().catalog.modelCandidates[id] ?? [];
}
