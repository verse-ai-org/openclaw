import { useEffect, useMemo } from "react";
import type { ChatMessage } from "@/components/chat/types";
import { parseQaPairsFromMessage } from "./ui-qa-format";
import { useInteractionStore } from "@/store/interaction.store";

/**
 * Hydrates `useInteractionStore.uiStateById` from persisted message history.
 *
 * Source of truth:
 * - user messages with `metadata.interaction.status="submitted"`
 * - Q/A summary text in the message content ("Q: ...\nA: ...")
 *
 * This makes UI surfaces (option_list/question_flow/approval_card) remain in
 * submitted/receipt state after a page refresh.
 */
export function useHydrateUiStateFromHistory(args: {
  activeThreadId: string;
  messages: ChatMessage[];
}) {
  const { activeThreadId, messages } = args;

  // Ensure the ephemeral store is scoped to this thread.
  useEffect(() => {
    useInteractionStore.getState().setActiveThreadId(activeThreadId);
  }, [activeThreadId]);

  const submitted = useMemo(() => {
    const out: Array<{
      uiId: string;
      submittedAt: number;
      summaryText: string;
      payload: unknown;
    }> = [];
    for (const m of messages) {
      if (m.role !== "user") continue;
      const interaction = m.metadata?.interaction;
      if (!interaction || interaction.status !== "submitted") continue;
      if (!interaction.id) continue;
      out.push({
        uiId: interaction.id,
        submittedAt: interaction.submittedAt ?? m.ts,
        summaryText: m.content ?? "",
        payload: interaction.payload,
      });
    }
    // Keep newest submission per uiId.
    const byId = new Map<string, (typeof out)[number]>();
    for (const item of out) {
      const prev = byId.get(item.uiId);
      if (!prev || item.submittedAt >= prev.submittedAt) {
        byId.set(item.uiId, item);
      }
    }
    return Array.from(byId.values());
  }, [messages]);

  useEffect(() => {
    const st = useInteractionStore.getState();
    const existing = st.uiStateById;

    for (const item of submitted) {
      const pairs = parseQaPairsFromMessage(item.summaryText);
      if (pairs.length === 0) {
        continue;
      }
      const prev = existing[item.uiId];
      // Idempotent: if we already have a submitted state, keep it (editing is user-driven).
      if (prev?.status === "submitted") {
        continue;
      }
      st.setSubmitted(item.uiId, { summary: pairs, payload: item.payload });
    }
  }, [submitted, activeThreadId]);
}

