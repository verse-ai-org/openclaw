import { describe, expect, it } from "vitest";
import type { RawMessage } from "@/hooks/chat-event-bridge";
import {
  normalizeHistoryMessages,
  projectInteractionsFromHistory,
} from "./history-normalize";

/**
 * Regression test for:
 *   - `interaction_request` PI message rows returned by chat.history seed
 *     the `interactions` slice.
 *   - Assistant text containing `<ask ...>...</ask>` gets hoisted into a
 *     `{type:"interaction"}` content block so InteractiveParts can bind it.
 *
 * Mirrors the on-disk shape of the real session JSONL entries we observed
 * in `~/.openclaw/agents/travel-planner/sessions/*.jsonl`.
 */
describe("history-normalize: interaction_request + <ask> hoisting", () => {
  it("seeds interactions and hoists <ask> in sibling assistant text", () => {
    const rawMessages: RawMessage[] = [
      {
        id: "u-1",
        role: "user",
        content: [{ type: "text", text: "帮我制定一个川西5日游" }],
        timestamp: 1,
      } as unknown as RawMessage,
      {
        id: "ir-1",
        role: "interaction_request",
        interactionId: "travel-preference-intake",
        component: "question_flow",
        payload: {
          id: "travel-preference-intake",
          steps: [
            {
              id: "departure_city",
              title: "出发城市",
              options: [{ id: "chengdu", label: "成都" }],
              selectionMode: "single",
            },
          ],
        },
        schemaVersion: 1,
        cancellable: false,
        timestamp: 2,
      } as unknown as RawMessage,
      {
        id: "a-1",
        role: "assistant",
        content: [
          { type: "thinking", thinking: "internal monologue" },
          {
            type: "text",
            text:
              "你好呀！我是 Tom。\n\n" +
              '<ask component="question_flow" id="travel-preference-intake">\n' +
              '{"id":"travel-preference-intake","steps":[]}\n' +
              "</ask>",
          },
        ],
        timestamp: 3,
      } as unknown as RawMessage,
    ];

    const { interactions } = projectInteractionsFromHistory(rawMessages);
    expect(interactions["travel-preference-intake"]).toBeDefined();
    const seeded = interactions["travel-preference-intake"]!;
    expect(seeded.component).toBe("question_flow");
    expect(seeded.status).toBe("pending");
    expect(seeded.payload).toMatchObject({ id: "travel-preference-intake" });

    const chatMessages = normalizeHistoryMessages(rawMessages, "sess-1");
    expect(chatMessages).toHaveLength(2);
    const assistant = chatMessages.find((m) => m.id === "a-1");
    expect(assistant).toBeDefined();
    expect(assistant!.contentBlocks).toBeDefined();
    const interactionBlocks = (assistant!.contentBlocks ?? []).filter(
      (b) => b.type === "interaction",
    );
    expect(interactionBlocks).toHaveLength(1);
    expect((interactionBlocks[0] as { interactionId: string }).interactionId).toBe(
      "travel-preference-intake",
    );
  });
});
