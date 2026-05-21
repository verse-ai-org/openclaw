import {
  createPluginRegistryFixture,
  registerVirtualTestPlugin,
} from "openclaw/plugin-sdk/plugin-test-contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearMemoryEmbeddingProviders,
  getRegisteredMemoryEmbeddingProvider,
  registerMemoryEmbeddingProvider,
} from "../memory-embedding-providers.js";
import { createPluginRecord } from "../status.test-helpers.js";

afterEach(() => {
  clearMemoryEmbeddingProviders();
});

describe("memory embedding provider registration", () => {
  it("rejects non-memory plugins that did not declare the capability contract", () => {
    const { config, registry } = createPluginRegistryFixture();

    registerVirtualTestPlugin({
      registry,
      config,
      id: "not-memory",
      name: "Not Memory",
      register(api) {
        api.registerMemoryEmbeddingProvider({
          id: "forbidden",
          create: async () => ({ provider: null }),
        });
      },
    });

    expect(getRegisteredMemoryEmbeddingProvider("forbidden")).toBeUndefined();
    const diagnostic = registry.registry.diagnostics.find(
      (entry) => entry.pluginId === "not-memory",
    );
    expect(diagnostic?.message).toBe(
      "plugin must own memory slot or declare contracts.memoryEmbeddingProviders for adapter: forbidden",
    );
  });

  it("allows non-memory plugins that declare the capability contract", () => {
    const { config, registry } = createPluginRegistryFixture();

    registerVirtualTestPlugin({
      registry,
      config,
      id: "external-vector",
      name: "External Vector",
      contracts: {
        memoryEmbeddingProviders: ["external-vector"],
      },
      register(api) {
        api.registerMemoryEmbeddingProvider({
          id: "external-vector",
          create: async () => ({ provider: null }),
        });
      },
    });

    const provider = getRegisteredMemoryEmbeddingProvider("external-vector");
    expect(provider?.adapter.id).toBe("external-vector");
    expect(provider?.ownerPluginId).toBe("external-vector");
  });

  it("records the owning memory plugin id for registered adapters", () => {
    const { config, registry } = createPluginRegistryFixture();

    registerVirtualTestPlugin({
      registry,
      config,
      id: "memory-core",
      name: "Memory Core",
      kind: "memory",
      register(api) {
        api.registerMemoryEmbeddingProvider({
          id: "demo-embedding",
          create: async () => ({ provider: null }),
        });
      },
    });

    const provider = getRegisteredMemoryEmbeddingProvider("demo-embedding");
    expect(provider?.adapter.id).toBe("demo-embedding");
    expect(provider?.ownerPluginId).toBe("memory-core");
  });

  it("treats same-owner memory embedding re-registration as idempotent", () => {
    registerMemoryEmbeddingProvider(
      {
        id: "openai",
        create: async () => ({ provider: null }),
      },
      { ownerPluginId: "openai" },
    );

    const { config, registry } = createPluginRegistryFixture();

    registerVirtualTestPlugin({
      registry,
      config,
      id: "openai",
      name: "OpenAI Provider",
      contracts: {
        memoryEmbeddingProviders: ["openai"],
      },
      register(api) {
        api.registerMemoryEmbeddingProvider({
          id: "openai",
          create: async () => ({ provider: null }),
        });
      },
    });

    expect(
      registry.registry.diagnostics.filter(
        (entry) =>
          entry.pluginId === "openai" &&
          entry.message.includes("memory embedding provider already registered"),
      ),
    ).toEqual([]);
    expect(getRegisteredMemoryEmbeddingProvider("openai")?.ownerPluginId).toBe("openai");
    expect(registry.registry.memoryEmbeddingProviders).toHaveLength(1);
  });

  it("rejects memory embedding registration when another plugin already owns the adapter", () => {
    registerMemoryEmbeddingProvider(
      {
        id: "shared-embedding",
        create: async () => ({ provider: null }),
      },
      { ownerPluginId: "owner-a" },
    );

    const { config, registry } = createPluginRegistryFixture();

    registerVirtualTestPlugin({
      registry,
      config,
      id: "owner-b",
      name: "Owner B",
      contracts: {
        memoryEmbeddingProviders: ["shared-embedding"],
      },
      register(api) {
        api.registerMemoryEmbeddingProvider({
          id: "shared-embedding",
          create: async () => ({ provider: null }),
        });
      },
    });

    expect(
      registry.registry.diagnostics.find((entry) => entry.pluginId === "owner-b")?.message,
    ).toBe("memory embedding provider already registered: shared-embedding (owner: owner-a)");
  });

  it("keeps companion embedding providers available during tool discovery", () => {
    const { config, registry } = createPluginRegistryFixture();
    const record = createPluginRecord({
      id: "tool-discovery-memory",
      name: "Tool Discovery Memory",
      kind: "memory",
      contracts: { tools: ["memory_recall"] },
    });
    registry.registry.plugins.push(record);
    const api = registry.createApi(record, {
      config,
      registrationMode: "tool-discovery",
    });

    api.registerMemoryEmbeddingProvider({
      id: "tool-discovery-embedding",
      create: async () => ({ provider: null }),
    });
    api.registerTool({
      name: "memory_recall",
      label: "Memory Recall",
      description: "Recall memory",
      parameters: {},
      execute: async () => ({ content: [], details: {} }),
    });

    const provider = getRegisteredMemoryEmbeddingProvider("tool-discovery-embedding");
    expect(provider?.adapter.id).toBe("tool-discovery-embedding");
    expect(provider?.ownerPluginId).toBe("tool-discovery-memory");
    expect(registry.registry.tools).toHaveLength(1);
    expect(registry.registry.tools[0]?.pluginId).toBe("tool-discovery-memory");
    expect(registry.registry.tools[0]?.names).toEqual(["memory_recall"]);
  });
});
