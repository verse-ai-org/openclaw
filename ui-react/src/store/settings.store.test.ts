import { describe, expect, it } from "vitest";
import { resolveGatewayToken, __test } from "./settings.store";

describe("resolveDevViteGatewayUrlFromState", () => {
  it("restores persisted Electron gateway URL on Vite dev refresh", () => {
    const url = __test.resolveDevViteGatewayUrlFromState({
      inElectron: true,
      persistedGatewayUrl: "ws://127.0.0.1:18790",
    });
    expect(url).toBe("ws://127.0.0.1:18790");
  });

  it("falls back to Bossim default port when Electron has no persisted URL", () => {
    const url = __test.resolveDevViteGatewayUrlFromState({
      inElectron: true,
      persistedGatewayUrl: "",
    });
    expect(url).toBe("ws://127.0.0.1:18790");
  });

  it("uses VITE_GATEWAY_PORT for browser-only Vite dev", () => {
    const url = __test.resolveDevViteGatewayUrlFromState({
      inElectron: false,
      persistedGatewayUrl: "ws://127.0.0.1:18790",
      viteGatewayPort: "19999",
    });
    expect(url).toBe("ws://127.0.0.1:19999");
  });
});

describe("resolveGatewayToken", () => {
  it("prefers dev env token over sessionStorage on localhost:5174 dev", () => {
    const token = resolveGatewayToken({
      urlToken: "",
      gatewayUrl: "ws://127.0.0.1:18789",
      devToken: "dev-token-from-env",
      inElectron: false,
    });
    expect(token).toBe("dev-token-from-env");
  });

  it("prefers dev env token over Electron url token in browser-only Vite dev", () => {
    const token = resolveGatewayToken({
      urlToken: "stale-electron-session-token",
      gatewayUrl: "ws://127.0.0.1:18789",
      devToken: "dev-token-from-env",
      inElectron: false,
    });
    expect(token).toBe("dev-token-from-env");
  });

  it("prefers Electron url token over dev env token when inElectron", () => {
    const token = resolveGatewayToken({
      urlToken: "electron-session-token",
      gatewayUrl: "ws://127.0.0.1:18789",
      devToken: "dev-token-from-env",
      inElectron: true,
    });
    expect(token).toBe("electron-session-token");
  });
});
