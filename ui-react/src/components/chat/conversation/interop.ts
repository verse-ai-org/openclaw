import type { ChatMessage, ContentBlock } from "@/components/chat/types";
import type { CanonicalMessage, ChatPart } from "./types";

function contentBlocksFromParts(parts: ChatPart[]): ContentBlock[] | undefined {
  const out: ContentBlock[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      out.push({ type: "text", text: p.text });
      continue;
    }
    if (p.type === "tool") {
      if (p.ui) {
        out.push({
          type: "ui",
          uiId:
            typeof (p.ui.payload as { id?: unknown } | undefined)?.id === "string"
              ? ((p.ui.payload as { id: string }).id)
              : p.id,
          component: p.ui.kind,
          payload: p.ui.payload,
        });
        continue;
      }
      out.push({
        type: "tool-call",
        toolCallId: p.id,
        toolName: p.toolName,
        argsText: p.args != null ? JSON.stringify(p.args, null, 2) : undefined,
        result: typeof p.output === "string" ? p.output : p.output != null ? JSON.stringify(p.output, null, 2) : undefined,
        phase: p.status === "error" ? "error" : p.status === "result" ? "result" : "call",
      });
      continue;
    }
  }
  return out.length > 0 ? out : undefined;
}

export function canonicalMessagesToChatMessages(messages: CanonicalMessage[]): ChatMessage[] {
  return messages
    .filter(
      (m): m is CanonicalMessage & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant",
    )
    .map((m) => {
      const text = m.parts
        .filter((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .trim();
      return {
        id: m.id,
        role: m.role,
        content: text,
        ts: m.createdAt,
        runId: m.runId,
        attachments: m.attachments,
        metadata: m.metadata,
        contentBlocks: contentBlocksFromParts(m.parts),
      } satisfies ChatMessage;
    });
}

export function chatMessagesToCanonicalSnapshot(messages: ChatMessage[]): CanonicalMessage[] {
  return messages.map((m) => {
    const parts: ChatPart[] = [];
    if (m.contentBlocks && m.contentBlocks.length > 0) {
      for (const b of m.contentBlocks) {
        if (b.type === "text") {
          parts.push({ type: "text", id: crypto.randomUUID(), text: b.text });
        } else if (b.type === "tool-call") {
          parts.push({
            type: "tool",
            id: b.toolCallId,
            toolName: b.toolName,
            args: b.argsText ? safeJsonParse(b.argsText) : undefined,
            status: b.phase === "error" ? "error" : b.phase === "result" ? "result" : "running",
            output: b.result,
          });
        } else if (b.type === "ui") {
          // Phase A (ui-tool migration): `ui` blocks are a UI-layer projection only.
          // Canonical snapshots continue to store interactive/tool parts for now.
        }
      }
    } else if (m.content.trim()) {
      parts.push({ type: "text", id: crypto.randomUUID(), text: m.content });
    }

    return {
      id: m.id,
      role: m.role,
      createdAt: m.ts,
      runId: m.runId,
      status: "complete",
      parts,
      attachments: m.attachments,
      metadata: m.metadata,
    };
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
