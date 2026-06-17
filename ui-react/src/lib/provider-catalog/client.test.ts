import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProviderCatalog } from "./client";

const VALID_CATALOG = {
  groups: [
    {
      id: "anthropic",
      label: "Anthropic",
      featured: true,
      methods: [{ id: "apiKey", label: "API key", type: "api-key" }],
    },
  ],
  emoji: { anthropic: "🟠" },
  modelCandidates: {},
};

function envelope(data: unknown) {
  return { code: 0, message: "ok", data };
}

describe("fetchProviderCatalog", () => {
  beforeEach(() => {
    // Default: not running in Electron, so platform resolves to "all".
    vi.stubGlobal("window", {} as unknown as Window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns ok with parsed catalog and ETag on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(
            envelope({ group: "providers", version: 7, items: { catalog: VALID_CATALOG } }),
          ),
          { status: 200, headers: { ETag: '"providers-7"' } },
        ),
      ),
    );

    const result = await fetchProviderCatalog();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.version).toBe(7);
      expect(result.etag).toBe('"providers-7"');
      expect(result.catalog.groups[0].id).toBe("anthropic");
    }
  });

  it("sends If-None-Match and maps 304 to not-modified", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProviderCatalog({ etag: '"providers-7"' });
    expect(result.status).toBe("not-modified");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "If-None-Match": '"providers-7"' }),
      }),
    );
  });

  it("returns error on non-zero envelope code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 3001, message: "boom" }), {
          status: 200,
        }),
      ),
    );
    const result = await fetchProviderCatalog();
    expect(result).toEqual({ status: "error", error: "boom" });
  });

  it("returns error when payload fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(envelope({ version: 1, items: { catalog: { groups: [] } } })),
          { status: 200 },
        ),
      ),
    );
    const result = await fetchProviderCatalog();
    expect(result.status).toBe("error");
  });

  it("returns error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await fetchProviderCatalog();
    expect(result).toEqual({ status: "error", error: "network down" });
  });
});
