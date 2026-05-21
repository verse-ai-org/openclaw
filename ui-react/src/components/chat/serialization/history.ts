import type { RawMessage } from "@/components/chat/types";
import type {
  CanonicalMessage,
  CanonicalRun,
  ChatPart,
  MessageId,
  PartId,
  RunId,
  ThreadId,
} from "@/components/chat/conversation";
import { normalizeContent, normalizeHistoryAttachmentHints } from "@/components/chat/gateway";
import {
  mergeTurnUsageMeta,
  type TurnUsageMeta,
} from "@/components/chat/usage/turn-usage-meta";
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

/**
 * Gateway history sometimes persists `isError: false` while the tool body still signals failure
 * (e.g. SSRF policy text from `src/infra/net/ssrf.ts`). Live WS uses `tool.error` for those.
 * Treat like an error when hydrating so ToolCallGroup matches pre-refresh semantics.
 */
function toolHistoryOutputImpliesError(output: unknown): boolean {
  if (typeof output === "string") {
    const t = output.trim();
    if (/^Blocked:/i.test(t)) return true;
    if (/^Error:/i.test(t)) return true;
    // Exec / CLI failures
    if (/\(Command exited with code [1-9]\d*\)/.test(t)) return true;
    return false;
  }
  return false;
}

function resolveHistoryToolStatus(tool: HistoryToolRecord | undefined): "error" | "result" | "running" {
  if (!tool) return "running";
  if (tool.isError === true) return "error";
  if (toolHistoryOutputImpliesError(tool.output)) return "error";
  if (tool.output != null) return "result";
  return "running";
}

function historyToolErrorOrOutputPayload(
  tool: HistoryToolRecord | undefined,
  status: "error" | "result" | "running",
): { error?: string; output?: unknown } {
  if (!tool) {
    return status === "error" ? { error: "Tool failed" } : {};
  }
  if (status !== "error") {
    return tool.output != null ? { output: tool.output } : {};
  }
  if (typeof tool.output === "string") return { error: tool.output };
  if (tool.output != null) return { error: JSON.stringify(tool.output) };
  return { error: "Tool failed" };
}

type HistoryMessageRecord = {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  runId?: string;
  attachments?: import("@/components/chat/types").MessageAttachment[];
  metadata?: import("@/components/chat/types").ChatMessageMetadata;
  parts: ChatPart[];
};

/**
 * Live streaming stores the whole assistant turn under `run:${runId}` (see reducer
 * `ensureAssistantMessageForRun`). Gateway history replay preserves one canonical row per
 * upstream assistant segment, which becomes multiple assistant-ui messages and multiple
 * tool groups. Merge adjacent assistant rows that share the same `runId` so history matches
 * the live layout.
 */
function mergeAdjacentAssistantMessagesSameRun(records: HistoryMessageRecord[]): HistoryMessageRecord[] {
  const out: HistoryMessageRecord[] = [];
  for (const m of records) {
    if (m.role !== "assistant") {
      out.push({ ...m, parts: [...m.parts] });
      continue;
    }
    const runId = typeof m.runId === "string" ? m.runId.trim() : "";
    if (!runId) {
      out.push({ ...m, parts: [...m.parts] });
      continue;
    }
    const stableId = `run:${runId}`;
    const prev = out.at(-1);
    if (prev?.role === "assistant" && prev.runId?.trim() === runId) {
      prev.parts = [...prev.parts, ...m.parts];
      prev.createdAt = Math.min(prev.createdAt, m.createdAt);
      prev.id = stableId;
      if (m.metadata && !prev.metadata) {
        prev.metadata = m.metadata;
      }
      continue;
    }
    out.push({
      ...m,
      id: stableId,
      runId,
      parts: [...m.parts],
    });
  }
  return out;
}

function toTs(m: RawMessage): number {
  return (typeof m.ts === "number" ? m.ts : undefined) ?? (typeof m.timestamp === "number" ? m.timestamp : undefined) ?? Date.now();
}

/**
 * Merge run summaries when paging in older gateway history (union by run id; widen time bounds).
 */
export function mergeHistoryRuns(a: CanonicalRun[], b: CanonicalRun[]): CanonicalRun[] {
  const byId = new Map<string, CanonicalRun>();
  for (const r of a) {
    byId.set(r.id, { ...r });
  }
  for (const r of b) {
    const existing = byId.get(r.id);
    if (!existing) {
      byId.set(r.id, { ...r });
      continue;
    }
    const endA = existing.finishedAt ?? existing.startedAt;
    const endB = r.finishedAt ?? r.startedAt;
    byId.set(r.id, {
      ...existing,
      startedAt: Math.min(existing.startedAt, r.startedAt),
      finishedAt: Math.max(endA, endB),
      assistantMessageId: existing.assistantMessageId ?? r.assistantMessageId,
      usageMeta: existing.usageMeta ?? r.usageMeta,
      status: "finished",
    });
  }
  return Array.from(byId.values()).toSorted((x, y) => x.startedAt - y.startedAt);
}

/**
 * Derive synthetic finished runs from gateway history rows (min/max wall time per `runId`).
 * Matches live `runsById` shape so ToolCallGroup can show whole-run duration after history load.
 */
export function deriveCanonicalRunsFromGatewayHistoryRaw(params: {
  threadId: ThreadId;
  messages: RawMessage[];
}): CanonicalRun[] {
  const { threadId, messages } = params;
  const bounds = new Map<string, { min: number; max: number }>();

  for (const raw of messages) {
    const runId = typeof raw.runId === "string" && raw.runId.trim() ? raw.runId.trim() : undefined;
    if (!runId) continue;
    const ts = toTs(raw);
    const b = bounds.get(runId) ?? { min: ts, max: ts };
    b.min = Math.min(b.min, ts);
    b.max = Math.max(b.max, ts);
    bounds.set(runId, b);
  }

  const out: CanonicalRun[] = [];
  for (const [runId, { min, max }] of bounds) {
    out.push({
      id: runId as RunId,
      threadId,
      status: "finished",
      startedAt: min,
      finishedAt: max,
      assistantMessageId: `run:${runId}` as MessageId,
    });
  }
  return out.toSorted((a, b) => a.startedAt - b.startedAt);
}

function normalizeHistoryRole(raw: unknown): "user" | "assistant" | "tool" | "toolresult" | "" {
  const lower = (typeof raw === "string" ? raw : "")
    .toLowerCase()
    .replace(/_/g, "")
    .trim();
  // Gateway history has been observed to use "human" for user messages in some providers.
  if (lower === "user" || lower === "human" || lower === "input") return "user";
  if (lower === "assistant") return "assistant";
  if (lower === "tool") return "tool";
  if (lower === "toolresult") return "toolresult";
  return "";
}

function isInternalTool(toolName: string | undefined): boolean {
  // Control-plane/debugging tools should not appear in history rendering.
  return (toolName ?? "").toLowerCase() === "session_status";
}

function isRuntimeTool(toolName: string | undefined): boolean {
  // Agent runtime tools (read/exec/search) are useful for debugging, but extremely spammy
  // when they appear as many separate tool groups. We fold them to the last assistant
  // message in a run so live/history tool groups align with the visible tail bubble.
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
 *
 * Returns canonical messages plus synthetic `CanonicalRun` rows derived from the same
 * raw rows (min/max timestamp per `runId`) so history hydration can populate `runsById` for UI
 * such as whole-run duration. This does not read Pi session `.jsonl` files; those are a separate
 * persistence format consumed by the agent, not the Control UI gateway history API.
 */
export function serializeGatewayHistoryToCanonicalSnapshot(params: {
  threadId: ThreadId;
  messages: RawMessage[];
  contextWindow?: number | null;
}): { messages: CanonicalMessage[]; runs: CanonicalRun[] } {
  const { threadId, messages, contextWindow = null } = params;

  const usageByRunId = new Map<string, TurnUsageMeta>();
  const toolById = new Map<string, HistoryToolRecord>();
  const assistantById = new Map<string, AssistantMessageAssembly>();
  const assistantOrderByRun = new Map<string, string[]>();
  const toolTimelineSeenByMessage = new Map<string, Set<string>>();
  const userMessages: HistoryMessageRecord[] = [];

  for (const raw of messages) {
    const ts = toTs(raw);
    const role = normalizeHistoryRole(raw.role);
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
      if (typeof msg.isError === "boolean") {
        record.isError = Boolean(record.isError) || msg.isError;
      }
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
      const mergedUsage = mergeTurnUsageMeta(
        usageByRunId.get(runId),
        raw,
        contextWindow,
      );
      if (mergedUsage) {
        usageByRunId.set(runId, mergedUsage);
      }
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
  // For runtime tools (exec/read/web_search/etc), fold them to the last assistant message
  // in the run so the tool group stays with the bubble the user is watching.
  const lastAssistantMessageIdByRun = new Map<string, string>();
  for (const [runId, order] of assistantOrderByRun) {
    const last = order.at(-1);
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
      const last = lastAssistantMessageIdByRun.get(rid);
      if (last) tool.ownerMessageId = last;
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

      const status = resolveHistoryToolStatus(tool);
      const errOut = historyToolErrorOrOutputPayload(tool, status);
      const part: ChatPart = {
        type: "tool",
        id: item.toolCallId as PartId,
        toolName,
        args: tool?.args,
        status,
        ...(uiComponent && uiPayload
          ? { ui: { kind: uiComponent, payload: uiPayload } }
          : {}),
        ...errOut,
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
      const st = resolveHistoryToolStatus(tool);
      const errOut = historyToolErrorOrOutputPayload(tool, st);
      existing.parts.push({
        type: "tool",
        id: tool.toolCallId as PartId,
        toolName,
        args: tool.args,
        status: st,
        ...(uiComponent && uiPayload
          ? { ui: { kind: uiComponent, payload: uiPayload } }
          : {}),
        ...errOut,
      });
      continue;
    }

    const toolName = tool.toolName ?? "tool";
    if (isInternalTool(toolName)) continue;
    const uiComponent = resolveToolUiComponent(toolName);
    const uiPayload = safeParseToolUiPayload(uiComponent, tool.output);
    const st = resolveHistoryToolStatus(tool);
    const errOut = historyToolErrorOrOutputPayload(tool, st);
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
          status: st,
          ...(uiComponent && uiPayload
            ? { ui: { kind: uiComponent, payload: uiPayload } }
            : {}),
          ...errOut,
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
    const st = resolveHistoryToolStatus(tool);
    const errOut = historyToolErrorOrOutputPayload(tool, st);
    msg.parts.push({
      type: "tool",
      id: tool.toolCallId as PartId,
      toolName,
      args: tool.args,
      status: st,
      ...(uiComponent && uiPayload
        ? { ui: { kind: uiComponent, payload: uiPayload } }
        : {}),
      ...errOut,
    });
  }

  // Sort messages by createdAt (stable) and finalize canonical shape.
  const all: HistoryMessageRecord[] = [...userMessages, ...assistantByRun.values()];
  const sorted = all.toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const merged = mergeAdjacentAssistantMessagesSameRun(sorted);

  const messagesOut = merged.map((m) => {
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
  const runs = deriveCanonicalRunsFromGatewayHistoryRaw({ threadId, messages }).map((run) => {
    const usageMeta = usageByRunId.get(run.id);
    return usageMeta ? { ...run, usageMeta } : run;
  });
  return { messages: messagesOut, runs };
}
