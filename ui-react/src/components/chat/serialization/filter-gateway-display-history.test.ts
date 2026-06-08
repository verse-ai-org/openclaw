import { describe, expect, it } from "vitest";
import { filterGatewayDisplayHistoryMessages } from "./filter-gateway-display-history";

describe("filterGatewayDisplayHistoryMessages", () => {
  it("drops heartbeat poll + HEARTBEAT_OK pairs", () => {
    const filtered = filterGatewayDisplayHistoryMessages([
      { role: "user", content: [{ type: "text", text: "[OpenClaw heartbeat poll]" }] },
      { role: "assistant", content: [{ type: "text", text: "HEARTBEAT_OK" }] },
      { role: "assistant", content: [{ type: "text", text: "Visible reply" }] },
    ]);

    expect(filtered).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Visible reply" }] },
    ]);
  });

  it("drops HEARTBEAT_OK acknowledgements that only carry hidden thinking blocks", () => {
    const filtered = filterGatewayDisplayHistoryMessages([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Nothing needs attention." },
          { type: "text", text: "HEARTBEAT_OK" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Useful hidden reasoning." },
          { type: "text", text: "Visible reply" },
        ],
      },
    ]);

    expect(filtered).toEqual([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Useful hidden reasoning." },
          { type: "text", text: "Visible reply" },
        ],
      },
    ]);
  });

  it("keeps HEARTBEAT_OK turns that carry visible non-text content", () => {
    const canvasBlock = { type: "canvas", preview: { kind: "canvas", url: "https://example.com" } };
    const filtered = filterGatewayDisplayHistoryMessages([
      {
        role: "assistant",
        content: [{ type: "text", text: "HEARTBEAT_OK" }, canvasBlock],
      },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.content).toEqual([
      { type: "text", text: "HEARTBEAT_OK" },
      canvasBlock,
    ]);
  });

  it("drops stream-error fallback and empty aborted assistant noise", () => {
    const filtered = filterGatewayDisplayHistoryMessages([
      {
        role: "assistant",
        content: [{ type: "text", text: "[assistant turn failed before producing content]" }],
        stopReason: "error",
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        stopReason: "aborted",
      },
      { role: "assistant", content: [{ type: "text", text: "Real answer" }] },
    ]);

    expect(filtered).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Real answer" }] },
    ]);
  });

  it("drops display-hidden runtime context rows", () => {
    const filtered = filterGatewayDisplayHistoryMessages([
      { role: "user", content: [{ type: "text", text: "[OpenClaw heartbeat poll]" }] },
      {
        role: "custom",
        customType: "openclaw.runtime-context",
        content: "hidden runtime context",
        display: false,
      },
      { role: "assistant", content: [{ type: "text", text: "HEARTBEAT_OK" }] },
    ]);

    expect(filtered).toEqual([]);
  });
});
