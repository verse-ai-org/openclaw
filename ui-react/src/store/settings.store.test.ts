import { describe, expect, it } from "vitest";
import { resolveGatewayToken } from "./settings.store";

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
