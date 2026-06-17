import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_PROVIDER_CATALOG } from "@/data/auth-choice-groups";
import type { ProviderCatalog } from "@/data/provider-catalog.types";

vi.mock("@/lib/provider-catalog/client", () => ({
  fetchProviderCatalog: vi.fn(),
}));
vi.mock("@/lib/provider-catalog/cache", () => ({
  readCachedCatalog: vi.fn(),
  writeCachedCatalog: vi.fn(),
}));

import { fetchProviderCatalog } from "@/lib/provider-catalog/client";
import {
  readCachedCatalog,
  writeCachedCatalog,
} from "@/lib/provider-catalog/cache";
import {
  findAuthMethod,
  findProviderGroup,
  useProviderCatalogStore,
} from "./provider-catalog.store";

const REMOTE: ProviderCatalog = {
  groups: [
    {
      id: "remote-provider",
      label: "Remote Provider",
      featured: true,
      methods: [{ id: "remote-key", label: "Remote key", type: "api-key" }],
    },
  ],
  emoji: { "remote-provider": "🛰️" },
  modelCandidates: { "remote-provider": ["remote-provider/model-x"] },
};

const fetchMock = vi.mocked(fetchProviderCatalog);
const readCacheMock = vi.mocked(readCachedCatalog);
const writeCacheMock = vi.mocked(writeCachedCatalog);

function resetStore() {
  useProviderCatalogStore.setState({
    catalog: BUILTIN_PROVIDER_CATALOG,
    source: "builtin",
    version: 0,
    etag: null,
    lastError: null,
    initialized: false,
  });
}

describe("provider-catalog.store", () => {
  beforeEach(() => {
    resetStore();
    readCacheMock.mockReset();
    writeCacheMock.mockReset();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts from the built-in catalog", () => {
    expect(useProviderCatalogStore.getState().source).toBe("builtin");
    expect(findProviderGroup("anthropic")?.label).toBe("Anthropic");
  });

  it("applies remote catalog and writes cache on successful refresh", async () => {
    readCacheMock.mockReturnValue(null);
    fetchMock.mockResolvedValue({
      status: "ok",
      catalog: REMOTE,
      etag: '"providers-9"',
      version: 9,
    });

    await useProviderCatalogStore.getState().init();

    const state = useProviderCatalogStore.getState();
    expect(state.source).toBe("remote");
    expect(state.version).toBe(9);
    expect(findProviderGroup("remote-provider")?.label).toBe("Remote Provider");
    expect(findAuthMethod("remote-key")?.type).toBe("api-key");
    expect(writeCacheMock).toHaveBeenCalledWith({
      etag: '"providers-9"',
      version: 9,
      catalog: REMOTE,
    });
  });

  it("hydrates from cache before remote refresh", async () => {
    readCacheMock.mockReturnValue({
      etag: '"providers-2"',
      version: 2,
      catalog: REMOTE,
    });
    // Remote says nothing changed.
    fetchMock.mockResolvedValue({ status: "not-modified" });

    await useProviderCatalogStore.getState().init();

    const state = useProviderCatalogStore.getState();
    expect(state.source).toBe("remote");
    expect(state.version).toBe(2);
    expect(findProviderGroup("remote-provider")).toBeDefined();
  });

  it("falls back to built-in when remote fails and no cache", async () => {
    readCacheMock.mockReturnValue(null);
    fetchMock.mockResolvedValue({ status: "error", error: "timeout" });

    await useProviderCatalogStore.getState().init();

    const state = useProviderCatalogStore.getState();
    expect(state.source).toBe("builtin");
    expect(state.lastError).toBe("timeout");
    expect(findProviderGroup("anthropic")).toBeDefined();
  });

  it("keeps cached catalog when remote fails after cache hydrate", async () => {
    readCacheMock.mockReturnValue({
      etag: '"providers-2"',
      version: 2,
      catalog: REMOTE,
    });
    fetchMock.mockResolvedValue({ status: "error", error: "timeout" });

    await useProviderCatalogStore.getState().init();

    const state = useProviderCatalogStore.getState();
    expect(state.source).toBe("cache");
    expect(findProviderGroup("remote-provider")).toBeDefined();
  });

  it("refresh(force) ignores the stored ETag", async () => {
    fetchMock.mockResolvedValue({
      status: "ok",
      catalog: REMOTE,
      etag: '"providers-9"',
      version: 9,
    });
    useProviderCatalogStore.setState({ etag: '"providers-old"' });

    await useProviderCatalogStore.getState().refresh({ force: true });

    expect(fetchMock).toHaveBeenCalledWith({ etag: null });
  });
});
