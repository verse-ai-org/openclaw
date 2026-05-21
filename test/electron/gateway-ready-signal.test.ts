import { describe, expect, it } from "vitest";
import {
  matchesGatewayReadyLogLine,
  noteChildGatewayReadySignal,
  stripGatewayLogAnsi,
} from "../../apps/electron/src/main/gateway-ready-signal.js";

describe("gateway ready signal", () => {
  it("matches legacy ws listen logs", () => {
    expect(matchesGatewayReadyLogLine("listening on ws://127.0.0.1:18789")).toBe(true);
  });

  it("matches current http server listen logs on stderr", () => {
    expect(
      matchesGatewayReadyLogLine(
        "2026-05-21T10:44:12.979+08:00 http server listening (ws://127.0.0.1:18789)",
      ),
    ).toBe(true);
  });

  it("strips ANSI color codes before matching", () => {
    const colored = "\u001B[32mhttp server listening on ws://127.0.0.1:18789\u001B[0m";
    expect(stripGatewayLogAnsi(colored)).not.toContain("\u001B");
    expect(matchesGatewayReadyLogLine(colored)).toBe(true);
  });

  it("updates child wait state when a ready line appears", () => {
    const state = { sawListening: false };
    noteChildGatewayReadySignal(state, "http server listening (port 18789)");
    expect(state.sawListening).toBe(true);
  });
});
