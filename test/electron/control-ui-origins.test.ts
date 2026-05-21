import { describe, expect, it } from "vitest";
import {
  isElectronManagedStaticOrigin,
  mergeElectronControlUiAllowedOrigins,
} from "../../apps/electron/src/main/control-ui-origins.js";

describe("control-ui-origins", () => {
  it("detects electron static-server origins on 127.0.0.1", () => {
    expect(isElectronManagedStaticOrigin("http://127.0.0.1:62924", 18789)).toBe(true);
    expect(isElectronManagedStaticOrigin("http://127.0.0.1:18789", 18789)).toBe(false);
    expect(isElectronManagedStaticOrigin("http://localhost:5174", 18789)).toBe(false);
    expect(isElectronManagedStaticOrigin("file://", 18789)).toBe(false);
  });

  it("prunes stale static-server ports and keeps the current one", () => {
    const merged = mergeElectronControlUiAllowedOrigins({
      existing: [
        "http://127.0.0.1:18789",
        "http://localhost:18789",
        "file://",
        "http://127.0.0.1:49890",
        "http://127.0.0.1:62924",
        "http://localhost:5174",
      ],
      gatewayPort: 18789,
      staticServerPort: 59004,
    });
    expect(merged).toContain("http://127.0.0.1:59004");
    expect(merged).not.toContain("http://127.0.0.1:49890");
    expect(merged).not.toContain("http://127.0.0.1:62924");
    expect(merged).toContain("http://localhost:5174");
    expect(merged).toContain("file://");
  });

  it("preserves user-added non-static origins", () => {
    const merged = mergeElectronControlUiAllowedOrigins({
      existing: ["https://control.example.com", "http://127.0.0.1:61577"],
      gatewayPort: 18789,
      staticServerPort: 61577,
    });
    expect(merged).toContain("https://control.example.com");
    expect(merged).toContain("http://127.0.0.1:61577");
  });
});
