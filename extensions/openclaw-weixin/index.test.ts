import { describe, expect, it, vi } from "vitest";
import entry from "./index.js";

vi.mock("./src/compat.js", () => ({
  assertHostCompatibility: vi.fn(),
}));

describe("openclaw-weixin bundled channel entry", () => {
  it("exports the bundled-channel-entry contract", () => {
    expect(entry.kind).toBe("bundled-channel-entry");
    expect(entry.id).toBe("openclaw-weixin");
    expect(typeof entry.loadChannelPlugin).toBe("function");
    expect(typeof entry.register).toBe("function");
  });

  it("loads the channel plugin from the narrow api surface", () => {
    const plugin = entry.loadChannelPlugin();
    expect(plugin.id).toBe("openclaw-weixin");
    expect(plugin.gateway?.loginWithQrStart).toBeTypeOf("function");
    expect(plugin.gateway?.loginWithQrWait).toBeTypeOf("function");
  });
});
