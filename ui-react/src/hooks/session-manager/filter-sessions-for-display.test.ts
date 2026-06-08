import { describe, expect, it } from "vitest";
import {
  filterSessionsForDisplay,
  isHiddenHeartbeatSessionKey,
} from "./filter-sessions-for-display";
import type { SessionEntry } from "./types";

describe("filterSessionsForDisplay", () => {
  it("drops heartbeat-recovered archive sessions", () => {
    const sessions: SessionEntry[] = [
      {
        key: "agent:main:heartbeat-recovered-2026-06-04t08-03-58.643z",
        derivedTitle: "[OpenClaw heartbeat poll]",
      },
      { key: "agent:main:main", derivedTitle: "Plan a trip" },
    ];

    const out = filterSessionsForDisplay(sessions);
    expect(out).toEqual([{ key: "agent:main:main", derivedTitle: "Plan a trip" }]);
  });

  it("drops isolated :heartbeat sibling sessions", () => {
    const sessions: SessionEntry[] = [
      { key: "agent:main:main:heartbeat", derivedTitle: "[OpenClaw heartbeat poll]" },
      { key: "agent:main:main", derivedTitle: "Real chat" },
    ];

    const out = filterSessionsForDisplay(sessions);
    expect(out).toEqual([{ key: "agent:main:main", derivedTitle: "Real chat" }]);
  });

  it("strips heartbeat noise from derivedTitle on kept sessions", () => {
    const sessions: SessionEntry[] = [
      {
        key: "agent:main:main",
        derivedTitle: "[OpenClaw heartbeat poll]",
        lastMessagePreview: "HEARTBEAT_OK",
      },
    ];

    const out = filterSessionsForDisplay(sessions);
    expect(out).toEqual([{ key: "agent:main:main" }]);
  });
});

describe("isHiddenHeartbeatSessionKey", () => {
  it("matches recovered and isolated heartbeat keys", () => {
    expect(isHiddenHeartbeatSessionKey("agent:main:heartbeat-recovered-2026-06-04")).toBe(true);
    expect(isHiddenHeartbeatSessionKey("agent:main:main:heartbeat")).toBe(true);
    expect(isHiddenHeartbeatSessionKey("agent:main:main")).toBe(false);
  });
});
