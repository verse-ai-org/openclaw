/**
 * Client for the bossim-service dynamic provider catalog endpoint:
 *   GET /api/v1/configs?group=providers&platform=...&app_version=...
 *
 * Returns a discriminated result so the store can decide how to merge:
 * - ok:           fresh catalog (200) -> update store + cache
 * - not-modified: ETag matched (304)  -> keep cached catalog
 * - error:        timeout/network/parse failure -> keep existing fallback
 */

import { CONFIG } from "@/data/config";
import {
  providerCatalogSchema,
  type ProviderCatalog,
} from "@/data/provider-catalog.types";
import { getElectronBridge } from "@/utils/electron-env";

const CONFIG_GROUP = "providers";
const FETCH_TIMEOUT_MS = 4000;

export type CatalogFetchResult =
  | {
      status: "ok";
      catalog: ProviderCatalog;
      etag: string | null;
      version: number;
    }
  | { status: "not-modified" }
  | { status: "error"; error: string };

/** Map the runtime platform to the backend's platform filter value. */
function resolvePlatform(): "macos" | "windows" | "all" {
  const platform = getElectronBridge()?.platform;
  if (platform === "darwin") {
    return "macos";
  }
  if (platform === "win32") {
    return "windows";
  }
  return "all";
}

type ConfigEnvelope = {
  code?: number;
  message?: string;
  data?: {
    group?: string;
    version?: number;
    items?: { catalog?: unknown };
  };
};

export async function fetchProviderCatalog(opts?: {
  etag?: string | null;
}): Promise<CatalogFetchResult> {
  const base = CONFIG.serviceBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    group: CONFIG_GROUP,
    platform: resolvePlatform(),
  });
  const appVersion = getElectronBridge()?.appVersion;
  if (appVersion) {
    params.set("app_version", appVersion);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (opts?.etag) {
      headers["If-None-Match"] = opts.etag;
    }
    const res = await fetch(`${base}/api/v1/configs?${params.toString()}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (res.status === 304) {
      return { status: "not-modified" };
    }
    if (!res.ok) {
      return { status: "error", error: `HTTP ${res.status}` };
    }

    const envelope = (await res.json()) as ConfigEnvelope;
    if (typeof envelope.code === "number" && envelope.code !== 0) {
      return {
        status: "error",
        error: envelope.message ?? `code ${envelope.code}`,
      };
    }

    const parsed = providerCatalogSchema.safeParse(envelope.data?.items?.catalog);
    if (!parsed.success) {
      return { status: "error", error: "invalid catalog payload" };
    }

    return {
      status: "ok",
      catalog: parsed.data,
      etag: res.headers.get("ETag"),
      version: envelope.data?.version ?? 0,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      status: "error",
      error: aborted ? "timeout" : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
