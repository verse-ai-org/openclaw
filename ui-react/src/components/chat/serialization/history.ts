import type { RawMessage } from "@/components/chat/types";
import type { CanonicalMessage, ChatPart, MessageId, PartId, RunId, ThreadId } from "@/components/chat/conversation";
import { normalizeContent, normalizeHistoryAttachmentHints } from "@/components/chat/gateway";
import { stripAttachmentContent } from "./_internal/history-attachment-strip";
import { resolveToolUiComponent, safeParseToolUiPayload } from "@/components/chat/ui-tool/ui-tool-registry";

type HistoryToolRecord = {
  toolCallId: string;
  toolName?: string;
  args?: unknown;
  // Raw tool result payload (best-effort). We keep it as unknown for canonical tool parts.
  output?: unknown;
  isError?: boolean;
  ts: number;
  runId?: string;
  callOrder?: number;
  resultOrder?: number;
  ownerMessageId?: string;
};

type HistoryMessageRecord = {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  runId?: string;
  attachments?: import("@/components/chat/types").MessageAttachment[];
  metadata?: import("@/components/chat/types").ChatMessageMetadata;
  parts: ChatPart[];
};

function toTs(m: RawMessage): number {
  return (typeof m.ts === "number" ? m.ts : undefined) ?? (typeof m.timestamp === "number" ? m.timestamp : undefined) ?? Date.now();
}

function isInternalTool(toolName: string | undefined): boolean {
  // Control-plane/debugging tools should not appear in history rendering.
  return (toolName ?? "").toLowerCase() === "session_status";
}

function isRuntimeTool(toolName: string | undefined): boolean {
  // Agent runtime tools (read/exec/search) are useful for debugging, but extremely spammy
  // when they appear as many separate tool groups. We fold them to the last assistant
  // message in a run to produce a single tool group.
  if (!toolName) return false;
  const name = toolName.toLowerCase();
  return (
    name === "read" ||
    name === "exec" ||
    name === "memory_search" ||
    name === "web_search" ||
    name === "search" ||
    name === "find"
  );
}

type RunTimelineItem =
  | { kind: "text"; order: number; ts: number; text: string }
  | { kind: "tool"; order: number; ts: number; toolCallId: string };

function toOrder(ts: number, idx: number): number {
  // Keep stable ordering within the same millisecond. `1_000` is enough for typical
  // content block counts, while staying well below JS's 2^53 limit.
  return ts * 1_000 + idx;
}

type ParsedAssistantItem =
  | { kind: "text"; order: number; ts: number; text: string }
  | {
      kind: "tool";
      order: number;
      ts: number;
      toolCallId: string;
      toolName?: string;
      args?: unknown;
    };

type AssistantMessageAssembly = {
  id: string;
  runId: string;
  createdAt: number;
  timeline: RunTimelineItem[];
};

function parseAssistantTimelineFromContent(params: {
  ts: number;
  content: unknown;
}): ParsedAssistantItem[] {
  const { ts, content } = params;
  if (!Array.isArray(content)) {
    const text = normalizeContent(content);
    return text.trim() ? [{ kind: "text", order: toOrder(ts, 0), ts, text }] : [];
  }
  const blocks = content as Array<Record<string, unknown>>;
  const out: ParsedAssistantItem[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") continue;
    const kind = (typeof b.type === "string" ? b.type : "").toLowerCase().replace(/_/g, "");
    if (kind === "text" && typeof b.text === "string" && b.text.trim()) {
      out.push({ kind: "text", order: toOrder(ts, i), ts, text: b.text });
      continue;
    }
    const isToolCall = kind === "toolcall" || kind === "tooluse";
    if (isToolCall) {
      const toolCallId =
        (typeof b.id === "string" ? b.id : undefined) ??
        (typeof b.toolCallId === "string" ? b.toolCallId : undefined);
      if (!toolCallId) continue;
      const toolName =
        typeof b.name === "string"
          ? b.name
          : typeof b.toolName === "string"
            ? b.toolName
            : undefined;
      const args = b.arguments ?? b.args;
      out.push({ kind: "tool", order: toOrder(ts, i), ts, toolCallId, toolName, args });
    }
  }
  return out;
}

/**
 * Convert Gateway `chat.history` rows into a canonical snapshot consumable by the new
 * conversation reducer. This is intentionally decoupled from legacy history projection
 * so history rendering matches the live (WS) canonical pipeline.
 *
 * Primary design goals:
 * - Robust to out-of-order toolResult rows.
 * - Correlate tool call + result by toolCallId (not positional "previous message").
 * - Avoid emitting internal/debug tools (e.g. session_status) into the thread UI.
 */
export function serializeGatewayHistoryToCanonicalSnapshot(params: {
  threadId: ThreadId;
  messages: RawMessage[];
}): CanonicalMessage[] {
  const { messages } = params;

  const toolById = new Map<string, HistoryToolRecord>();
  const assistantById = new Map<string, AssistantMessageAssembly>();
  const assistantOrderByRun = new Map<string, string[]>();
  const toolTimelineSeenByMessage = new Map<string, Set<string>>();
  const userMessages: HistoryMessageRecord[] = [];

  for (const raw of messages) {
    const ts = toTs(raw);
    const role = (raw.role ?? "").toLowerCase().replace(/_/g, "");
    const runId = typeof raw.runId === "string" && raw.runId.trim() ? raw.runId : undefined;

    // User rows: preserve as plain text + attachments metadata.
    if (role === "user") {
      const rawText = normalizeContent(raw.content ?? raw.text ?? "");
      const stripped = stripAttachmentContent(rawText);
      const attachments =
        normalizeHistoryAttachmentHints(raw.attachments) ??
        (stripped.attachments.length > 0 ? stripped.attachments : undefined);

      userMessages.push({
        id: raw.id ?? crypto.randomUUID(),
        role: "user",
        createdAt: ts,
        runId,
        attachments,
        metadata: raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as HistoryMessageRecord["metadata"]) : undefined,
        parts: stripped.prompt.trim()
          ? [{ type: "text", id: `text:${ts}` as PartId, text: stripped.prompt }]
          : [],
      });
      continue;
    }

    // ToolResult rows (top-level messages in history).
    if (role === "toolresult" || role === "tool") {
      const msg = raw as unknown as Record<string, unknown>;
      const toolCallId =
        typeof msg.toolCallId === "string"
          ? msg.toolCallId
          : typeof msg.id === "string"
            ? msg.id
            : undefined;
      if (!toolCallId) continue;
      const toolName = typeof msg.toolName === "string" ? msg.toolName : undefined;
      if (isInternalTool(toolName)) continue;

      const contentText = normalizeContent(msg.content);
      const record = toolById.get(toolCallId) ?? { toolCallId, ts, runId };
      record.toolName ??= toolName;
      record.output = contentText || record.output;
      if (typeof msg.isError === "boolean") record.isError = msg.isError;
      // Prefer earliest timestamp for ordering.
      record.ts = Math.min(record.ts, ts);
      record.runId ??= runId;
      record.resultOrder ??= toOrder(ts, 0);
      toolById.set(toolCallId, record);
      continue;
    }

    // Assistant rows: build a per-run timeline (text/tool/text/...).
    if (role === "assistant") {
      if (!runId) continue;
      const messageId = raw.id ?? (`run:${runId}:${ts}` as const);
      const items = parseAssistantTimelineFromContent({
        ts,
        content: raw.content ?? raw.text ?? "",
      });
      if (items.length === 0) continue;

      const assembly =
        assistantById.get(messageId) ??
        (() => {
          const created: AssistantMessageAssembly = {
            id: messageId,
            runId,
            createdAt: ts,
            timeline: [],
          };
          assistantById.set(messageId, created);
          const order = assistantOrderByRun.get(runId) ?? [];
          order.push(messageId);
          assistantOrderByRun.set(runId, order);
          return created;
        })();

      // Keep earliest createdAt for stable ordering.
      assembly.createdAt = Math.min(assembly.createdAt, ts);

      const seen = toolTimelineSeenByMessage.get(messageId) ?? new Set<string>();
      for (const item of items) {
        if (item.kind === "text") {
          assembly.timeline.push({ kind: "text", order: item.order, ts: item.ts, text: item.text });
          continue;
        }

        if (isInternalTool(item.toolName)) {
          continue;
        }

        // Record the tool call.
        const record = toolById.get(item.toolCallId) ?? { toolCallId: item.toolCallId, ts, runId };
        record.toolName ??= item.toolName;
        record.args ??= item.args;
        record.ts = Math.min(record.ts, ts);
        record.runId ??= runId;
        record.callOrder ??= item.order;
        record.ownerMessageId ??= messageId;
        toolById.set(item.toolCallId, record);

        // Put a single tool marker on the timeline (call position wins for ordering).
        if (!seen.has(item.toolCallId)) {
          assembly.timeline.push({
            kind: "tool",
            order: item.order,
            ts: item.ts,
            toolCallId: item.toolCallId,
          });
          seen.add(item.toolCallId);
        }
      }

      toolTimelineSeenByMessage.set(messageId, seen);
    }
  }

  // For interactive tools (question_flow/option_list/approval_card), attach the UI to the last
  // assistant message in the run. This avoids duplicate rendering caused by run-folding logic.
  //
  // For runtime tools (exec/read/web_search/etc), fold them to the first assistant message
  // in the run so the tool group appears at the start of the turn.
  const lastAssistantMessageIdByRun = new Map<string, string>();
  const firstAssistantMessageIdByRun = new Map<string, string>();
  for (const [runId, order] of assistantOrderByRun) {
    const first = order.at(0);
    const last = order.at(-1);
    if (first) firstAssistantMessageIdByRun.set(runId, first);
    if (last) lastAssistantMessageIdByRun.set(runId, last);
  }
  for (const tool of toolById.values()) {
    const component = resolveToolUiComponent(tool.toolName);
    const rid = tool.runId;
    if (!rid) continue;
    if (component) {
      const last = lastAssistantMessageIdByRun.get(rid);
      if (last) tool.ownerMessageId = last;
      continue;
    }
    if (isRuntimeTool(tool.toolName)) {
      const first = firstAssistantMessageIdByRun.get(rid);
      if (first) tool.ownerMessageId = first;
    }
  }

  // Build assistant canonical messages per message id (preserve segmentation + interleaving).
  const assistantByRun = new Map<string, HistoryMessageRecord>();
  for (const assembly of assistantById.values()) {
    const { id: messageId, runId, createdAt } = assembly;
    const timeline = assembly.timeline.toSorted((a, b) => a.order - b.order);
    const parts: ChatPart[] = [];

    let pendingText = "";
    let pendingTextTs = createdAt;
    const flushText = () => {
      if (!pendingText.trim()) {
        pendingText = "";
        return;
      }
      parts.push({ type: "text", id: `text:${pendingTextTs}` as PartId, text: pendingText });
      pendingText = "";
    };

    for (const item of timeline) {
      if (item.kind === "text") {
        if (!pendingText) pendingTextTs = item.ts;
        pendingText += pendingText ? `\n${item.text}` : item.text;
        continue;
      }

      const tool = toolById.get(item.toolCallId);
      const toolName = tool?.toolName ?? "tool";
      if (isInternalTool(toolName)) continue;
      const uiComponent = resolveToolUiComponent(toolName);
      const uiPayload = safeParseToolUiPayload(uiComponent, tool?.output);

      // If this tool is folded to a different message, skip it here.
      if (tool?.ownerMessageId && tool.ownerMessageId !== messageId) {
        continue;
      }

      // Tool boundary — flush text so the tool appears interleaved.
      flushText();

      const status = tool?.isError ? "error" : tool?.output != null ? "result" : "running";
      const part: ChatPart = {
        type: "tool",
        id: item.toolCallId as PartId,
        toolName,
        args: tool?.args,
        status,
        ...(uiComponent && uiPayload
          ? { ui: { kind: uiComponent, payload: uiPayload } }
          : {}),
        ...(status === "error"
          ? { error: typeof tool?.output === "string" ? tool.output : undefined }
          : { output: tool?.output }),
      };
      parts.push(part);
    }
    flushText();

    // Key by message id (keep segmentation). We still store `runId` on the message.
    assistantByRun.set(messageId, {
      id: messageId,
      role: "assistant",
      createdAt,
      runId,
      parts,
    });
  }

  // Ensure tool-only runs still render, and place tools in a deterministic order even
  // when no assistant `toolCall` marker exists (history can be lossy/out-of-order).
  for (const tool of toolById.values()) {
    if (!tool.runId) continue;
    const runId = tool.runId;
    const ownerMessageId = tool.ownerMessageId;
    if (ownerMessageId) {
      // This tool is already anchored to a specific assistant message; nothing to do.
      continue;
    }

    // If no message owns this tool, attach it to the *last* assistant message in this run if present;
    // otherwise create a dedicated tool-only assistant message.
    const order = assistantOrderByRun.get(runId) ?? [];
    const lastMessageId = order.length > 0 ? order[order.length - 1]! : undefined;
    const targetId = lastMessageId ?? (`run:${runId}:toolonly:${tool.toolCallId}` as const);

    const existing = assistantByRun.get(targetId);
    if (existing) {
      if (existing.parts.some((p) => p.type === "tool" && p.id === tool.toolCallId)) {
        continue;
      }
      const toolName = tool.toolName ?? "tool";
      if (isInternalTool(toolName)) continue;
      const uiComponent = resolveToolUiComponent(toolName);
      const uiPayload = safeParseToolUiPayload(uiComponent, tool.output);
      existing.parts.push({
        type: "tool",
        id: tool.toolCallId as PartId,
        toolName,
        args: tool.args,
        status: tool.isError ? "error" : tool.output != null ? "result" : "running",
        ...(uiComponent && uiPayload
          ? { ui: { kind: uiComponent, payload: uiPayload } }
          : {}),
        ...(tool.isError ? { error: typeof tool.output === "string" ? tool.output : undefined } : { output: tool.output }),
      });
      continue;
    }

    const toolName = tool.toolName ?? "tool";
    if (isInternalTool(toolName)) continue;
    const uiComponent = resolveToolUiComponent(toolName);
    const uiPayload = safeParseToolUiPayload(uiComponent, tool.output);
    assistantByRun.set(targetId, {
      id: targetId,
      role: "assistant",
      createdAt: tool.ts,
      runId,
      parts: [
        {
          type: "tool",
          id: tool.toolCallId as PartId,
          toolName,
          args: tool.args,
          status: tool.isError ? "error" : tool.output != null ? "result" : "running",
          ...(uiComponent && uiPayload
            ? { ui: { kind: uiComponent, payload: uiPayload } }
            : {}),
          ...(tool.isError ? { error: typeof tool.output === "string" ? tool.output : undefined } : { output: tool.output }),
        },
      ],
    });
  }

  // Tools without a toolCall marker in assistant content won't appear interleaved.
  // As a fallback, append them to the end of the run message so they are not dropped.
  for (const tool of toolById.values()) {
    if (!tool.runId) continue;
    const runId = tool.runId;
    const ownerMessageId =
      tool.ownerMessageId ??
      (() => {
        const order = assistantOrderByRun.get(runId) ?? [];
        return order.length > 0 ? order[order.length - 1]! : undefined;
      })();
    if (!ownerMessageId) continue;
    const msg = assistantByRun.get(ownerMessageId);
    if (!msg) continue;
    if (msg.parts.some((p) => p.type === "tool" && p.id === tool.toolCallId)) continue;
    const toolName = tool.toolName ?? "tool";
    if (isInternalTool(toolName)) continue;
    const uiComponent = resolveToolUiComponent(toolName);
    const uiPayload = safeParseToolUiPayload(uiComponent, tool.output);
    msg.parts.push({
      type: "tool",
      id: tool.toolCallId as PartId,
      toolName,
      args: tool.args,
      status: tool.isError ? "error" : tool.output != null ? "result" : "running",
      ...(uiComponent && uiPayload
        ? { ui: { kind: uiComponent, payload: uiPayload } }
        : {}),
      ...(tool.isError ? { error: typeof tool.output === "string" ? tool.output : undefined } : { output: tool.output }),
    });
  }

  // Sort messages by createdAt (stable) and finalize canonical shape.
  const all: HistoryMessageRecord[] = [...userMessages, ...assistantByRun.values()];
  const sorted = all.toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  return sorted.map((m) => {
    const canonical: CanonicalMessage = {
      id: m.id as MessageId,
      role: m.role as CanonicalMessage["role"],
      createdAt: m.createdAt,
      runId: m.runId as RunId | undefined,
      status: "complete",
      parts: m.parts,
      attachments: m.attachments,
      metadata: m.metadata,
    };
    return canonical;
  });
}
