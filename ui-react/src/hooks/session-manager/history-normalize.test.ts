import { describe, expect, it } from "vitest";
import { normalizeHistoryMessages } from "./history-normalize";

describe("history-normalize", () => {
  it("maps interaction_resume envelope to display text", () => {
    const messages = normalizeHistoryMessages(
      [
        {
          id: "u1",
          role: "user",
          content:
            '<interaction_resume>\n{"version":1,"interactionId":"ix-1","kind":"option_list","payload":{"version":1,"displayText":"搜索（全网搜索，推荐）"}}\n</interaction_resume>',
          ts: 1,
        },
        {
          id: "a1",
          role: "assistant",
          content: "好的，我继续规划。",
          ts: 2,
        },
      ],
      "agent:travel:main",
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.id).toBe("u1");
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("搜索（全网搜索，推荐）");
  });

  it("filters malformed interaction_resume envelope from history", () => {
    const messages = normalizeHistoryMessages(
      [
        {
          id: "u1",
          role: "user",
          content:
            "<interaction_resume>\nnot-json\n</interaction_resume>",
          ts: 1,
        },
        {
          id: "a1",
          role: "assistant",
          content: "好的，我继续规划。",
          ts: 2,
        },
      ],
      "agent:travel:main",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("a1");
  });
});
