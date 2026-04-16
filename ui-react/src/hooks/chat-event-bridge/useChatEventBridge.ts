import { useEffect } from "react";
import {
  useChatStore,
  toolStreamEntryToResultText,
  type ToolStreamEntry,
  type ChatMessage,
  type ContentBlock,
  type MessageAttachment,
} from "@/store/chat.store";
import {
  registerChatDispatch,
  unregisterChatDispatch,
} from "@/store/gateway.store";
import {
  extractMessageText,
  normalizeContent,
  normalizeHistoryAttachmentHints,
  normalizeRole,
  stripAttachmentContent,
} from "./message-normalize";
import { isChatEventForActiveSession } from "./session-scope";
import {
  consolidateToolMessages,
  extractContentBlocks,
  extractToolCallParts,
  mergeToolResults,
} from "./tool-blocks";
import {
  createInteractiveBlock,
  isInteractiveToolName,
} from "./interactive-blocks";
import type { RawMessage } from "./types";

function extractInteractivePayload(data: Record<string, unknown>): unknown {
  const candidate = data.result ?? data.meta ?? data.args;
  if (typeof candidate === "string") {
    return candidate;
  }
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }
  if (!Array.isArray((candidate as { content?: unknown }).content)) {
    return candidate;
  }
  const content = (candidate as { content: unknown[] }).content;
  const text = content
    .filter(
      (entry): entry is { type: "text"; text: string } =>
        !!entry &&
        typeof entry === "object" &&
        (entry as { type?: unknown }).type === "text" &&
        typeof (entry as { text?: unknown }).text === "string",
    )
    .filter(
      (entry): entry is { type: "text"; text: string } =>
        entry.type === "text" && typeof entry.text === "string",
    )
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join("\n");
  return text || candidate;
}

export function useChatEventBridge() {
  useEffect(() => {
    const pendingInteractiveHydrationRuns = new Set<string>();
    // Buffer for out-of-order tool events: result/error may arrive before start.
    const pendingToolResults = new Map<
      string,
      { phase: "result" | "error"; data: Record<string, unknown> }
    >();

    const dispatch = (event: string, payload: unknown) => {
      const p = payload as Record<string, unknown> | undefined;

      if (import.meta.env.DEV) {
        console.log(`[ChatEventBridge] ${event}`, payload);
      }

      switch (event) {
        case "chat": {
          const chatPayload = p as
            | {
                runId?: string;
                sessionKey?: string;
                state?: string;
                message?: unknown;
                errorMessage?: string;
              }
            | undefined;
          const state = chatPayload?.state;
          const sk =
            typeof chatPayload?.sessionKey === "string" &&
            chatPayload.sessionKey.trim()
              ? chatPayload.sessionKey.trim()
              : "";
          if (sk) {
            if (state === "final" || state === "error" || state === "aborted") {
              useChatStore.getState().clearSessionGenerating(sk);
            } else if (state === "delta") {
              useChatStore
                .getState()
                .markSessionGenerating(sk, chatPayload?.runId);
            }
          }
          if (!isChatEventForActiveSession(chatPayload?.sessionKey)) {
            break;
          }

          if (state === "delta") {
            const text = extractMessageText(chatPayload?.message);
            if (text) {
              useChatStore.getState().setStream(text);
            }
          } else if (state === "final") {
            const text = extractMessageText(chatPayload?.message);
            const finalRunId =
              typeof chatPayload?.runId === "string"
                ? chatPayload.runId
                : undefined;
            if (text) {
              const storeState = useChatStore.getState();
              const {
                committedBlocks,
                toolStreamById,
                toolStreamOrder,
                interactiveStreamById,
                interactiveStreamOrder,
              } = storeState;
              const hasToolCalls = toolStreamOrder.length > 0;
              const hasInteractive = interactiveStreamOrder.length > 0;
              const hasCommitted = committedBlocks.length > 0;

              if (hasToolCalls || hasInteractive || hasCommitted) {
                const contentBlocks: ContentBlock[] = [...committedBlocks];
                for (const id of interactiveStreamOrder) {
                  const entry = interactiveStreamById.get(id);
                  if (!entry) {
                    continue;
                  }
                  contentBlocks.push(entry);
                }
                for (const id of toolStreamOrder) {
                  const entry = toolStreamById.get(id);
                  if (!entry) {
                    continue;
                  }
                  contentBlocks.push({
                    type: "tool-call",
                    toolCallId: entry.id,
                    toolName: entry.toolName ?? "tool",
                    argsText:
                      entry.input != null
                        ? JSON.stringify(entry.input, null, 2)
                        : undefined,
                    result: toolStreamEntryToResultText(entry),
                    phase:
                      entry.phase === "result"
                        ? "result"
                        : entry.phase === "error"
                          ? "error"
                          : "call",
                  });
                }
                if (text.trim()) {
                  contentBlocks.push({ type: "text", text });
                }
                const finalMsg: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: text,
                  ts: Date.now(),
                  runId: chatPayload?.runId,
                  contentBlocks:
                    contentBlocks.length > 0 ? contentBlocks : undefined,
                };
                // Atomic: append message + clear stream state in one Zustand set()
                useChatStore.getState().commitStreamAsMessage(finalMsg);
              } else {
                const finalMsg: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: text,
                  ts: Date.now(),
                  runId: chatPayload?.runId,
                };
                // Atomic: append message + clear stream state in one Zustand set()
                useChatStore.getState().commitStreamAsMessage(finalMsg);
              }
              if (
                finalRunId &&
                pendingInteractiveHydrationRuns.has(finalRunId)
              ) {
                const rawKey = chatPayload?.sessionKey ?? "";
                if (rawKey) {
                  useChatStore.getState().setPendingHistoryReloadKey(rawKey);
                }
                pendingInteractiveHydrationRuns.delete(finalRunId);
              }
            } else if (
              useChatStore.getState().stream !== null ||
              useChatStore.getState().committedBlocks.length > 0
            ) {
              useChatStore.getState().finalizeStream();
              if (
                finalRunId &&
                pendingInteractiveHydrationRuns.has(finalRunId)
              ) {
                const rawKey = chatPayload?.sessionKey ?? "";
                if (rawKey) {
                  useChatStore.getState().setPendingHistoryReloadKey(rawKey);
                }
                pendingInteractiveHydrationRuns.delete(finalRunId);
              }
            } else {
              useChatStore.getState().resetStream();
              const rawKey = chatPayload?.sessionKey ?? "";
              if (rawKey) {
                useChatStore.getState().setPendingHistoryReloadKey(rawKey);
              }
            }
            useChatStore.getState().setSending(false);
            useChatStore.getState().setRunId(null);
            // Bump seq so useSessionManager re-fetches the session list
            // and derivedTitle (session title) reflects the new message.
            useChatStore.getState().triggerSessionsReload();
          } else if (state === "aborted" || state === "error") {
            useChatStore.getState().resetStream();
            useChatStore.getState().setSending(false);
            useChatStore.getState().setRunId(null);
            if (state === "error") {
              const errMsg =
                chatPayload?.errorMessage ??
                "Generation failed. Please try again.";
              useChatStore
                .getState()
                .setLastError(
                  typeof errMsg === "string"
                    ? errMsg
                    : "Generation failed. Please try again.",
                );
            }
          }
          break;
        }

        case "agent": {
          const agentPayload = p as {
            stream?: string;
            sessionKey?: string;
            runId?: string;
            data?: unknown;
          };
          const agentSk =
            typeof agentPayload.sessionKey === "string" &&
            agentPayload.sessionKey.trim()
              ? agentPayload.sessionKey.trim()
              : "";
          if (agentSk && agentPayload.stream === "tool") {
            useChatStore
              .getState()
              .markSessionGenerating(agentSk, agentPayload.runId);
          }
          if (!isChatEventForActiveSession(agentPayload?.sessionKey)) {
            break;
          }
          const stream = agentPayload?.stream as string | undefined;
          const data = agentPayload?.data as
            | Record<string, unknown>
            | undefined;

          if (stream === "tool" && data) {
            const phase = data.phase as string | undefined;
            const toolCallId = data.toolCallId as string | undefined;
            const toolName = data.name as string | undefined;

            if (isInteractiveToolName(toolName)) {
              if (phase === "start") {
                // Freeze any pending text so it stays visually above the interactive block.
                useChatStore.getState().commitCurrentText();
              } else if (phase === "result") {
                const interactivePayload = extractInteractivePayload(data);
                const block = createInteractiveBlock({
                  interactiveId: toolCallId ?? crypto.randomUUID(),
                  kind: toolName,
                  payload: interactivePayload,
                });
                if (import.meta.env.DEV && !block) {
                  console.warn("[interactive] dropped interactive payload", {
                    toolName,
                    toolCallId,
                    phase,
                    interactivePayload,
                  });
                }
                if (block) {
                  useChatStore.getState().commitCurrentText();
                  useChatStore.getState().upsertInteractiveStream(block);
                  if (typeof agentPayload.runId === "string") {
                    pendingInteractiveHydrationRuns.delete(agentPayload.runId);
                  }
                } else if (typeof agentPayload.runId === "string") {
                  pendingInteractiveHydrationRuns.add(agentPayload.runId);
                }
              }
              break; // All interactive phases handled above — skip regular tool logic
            }

            if (phase === "start") {
              useChatStore.getState().commitCurrentText();

              const entryId = toolCallId ?? crypto.randomUUID();
              const entry: ToolStreamEntry = {
                id: entryId,
                toolName: toolName,
                phase: "start",
                input: data.args,
              };
              useChatStore.getState().upsertToolStream(entry);

              // Apply any buffered result/error that arrived before start (out-of-order).
              const buffered = pendingToolResults.get(entryId);
              if (buffered) {
                pendingToolResults.delete(entryId);
                const isError = buffered.phase === "error";
                useChatStore.getState().upsertToolStream({
                  ...entry,
                  phase: isError ? "error" : "result",
                  error: isError
                    ? typeof buffered.data.error === "string"
                      ? buffered.data.error
                      : "unknown error"
                    : undefined,
                  output: isError
                    ? undefined
                    : (buffered.data.meta ?? buffered.data.result ?? undefined),
                });
              }
            } else if (phase === "result") {
              const resolvedId = toolCallId ?? "";
              const existing = useChatStore
                .getState()
                .toolStreamById.get(resolvedId);
              if (existing) {
                const isError = Boolean(data.isError);
                if (isError) {
                  useChatStore.getState().upsertToolStream({
                    ...existing,
                    phase: "error",
                    error:
                      typeof data.error === "string" ? data.error : undefined,
                    output: data.meta ?? data.result ?? undefined,
                  });
                } else {
                  useChatStore.getState().upsertToolStream({
                    ...existing,
                    phase: "result",
                    output: data.meta ?? data.result ?? undefined,
                  });
                }
              } else if (resolvedId) {
                // start not yet received — buffer for later
                pendingToolResults.set(resolvedId, { phase: "result", data });
              }
            } else if (phase === "error") {
              const resolvedId = toolCallId ?? "";
              const existing = useChatStore
                .getState()
                .toolStreamById.get(resolvedId);
              if (existing) {
                useChatStore.getState().upsertToolStream({
                  ...existing,
                  phase: "error",
                  error: (data.error as string) ?? "unknown error",
                });
              } else if (resolvedId) {
                // start not yet received — buffer for later
                pendingToolResults.set(resolvedId, { phase: "error", data });
              }
            }
          }
          break;
        }

        case "chat.history": {
          const historySessionKey =
            typeof p?.sessionKey === "string" ? p.sessionKey : undefined;
          if (!isChatEventForActiveSession(historySessionKey)) {
            break;
          }
          const msgs = (p?.messages ?? []) as RawMessage[];

          if (import.meta.env.DEV) {
            console.group("[chat.history] raw messages");
            console.log(`total: ${msgs.length}`);
            msgs.slice(0, 20).forEach((m, i) => {
              const role = m.role ?? "?";
              const content = m.content;
              const preview = Array.isArray(content)
                ? (content as Array<Record<string, unknown>>)
                    .map(
                      (b) =>
                        `${b.type}${b.name ? `:${b.name}` : b.toolCallId ? `:${String(b.toolCallId).slice(0, 8)}` : ""}`,
                    )
                    .join(", ")
                : String(content ?? "").slice(0, 60);
              console.log(`  [${i}] role=${role} content=[${preview}]`);
            });
            console.groupEnd();
          }

          const mergedMsgs = mergeToolResults(msgs) as RawMessage[];

          if (import.meta.env.DEV) {
            console.group("[chat.history] after mergeToolResults");
            console.log(`total: ${mergedMsgs.length}`);
            mergedMsgs.slice(0, 20).forEach((m, i) => {
              const role = m.role ?? "?";
              const content = m.content;
              const preview = Array.isArray(content)
                ? (content as Array<Record<string, unknown>>)
                    .map(
                      (b) =>
                        `${b.type}${b.name ? `:${b.name}` : b.toolCallId ? `:${String(b.toolCallId).slice(0, 8)}` : ""}`,
                    )
                    .join(", ")
                : String(content ?? "").slice(0, 60);
              console.log(`  [${i}] role=${role} content=[${preview}]`);
            });
            console.groupEnd();
          }

          const normalized: ChatMessage[] = mergedMsgs.map((m) => {
            const role = normalizeRole(m.role);
            const rawContent = normalizeContent(m.content ?? m.text ?? "");

            let content = rawContent;
            let attachments: MessageAttachment[] | undefined;
            if (role === "user") {
              const fromGateway = normalizeHistoryAttachmentHints(
                m.attachments,
              );
              const stripped = stripAttachmentContent(rawContent);
              content = stripped.prompt;
              attachments =
                fromGateway ??
                (stripped.attachments.length > 0
                  ? stripped.attachments
                  : undefined);
            }

            return {
              id: m.id ?? crypto.randomUUID(),
              role,
              content,
              ts: m.ts ?? m.timestamp ?? Date.now(),
              runId: m.runId,
              sessionKey: m.sessionKey,
              attachments,
              toolCalls: extractToolCallParts(m.content),
              contentBlocks: extractContentBlocks(m.content),
            };
          });

          if (import.meta.env.DEV) {
            console.group("[chat.history] after normalize");
            console.log(`total: ${normalized.length}`);
            normalized.slice(0, 20).forEach((m, i) => {
              const blocks = m.contentBlocks;
              const preview = blocks
                ? blocks
                    .map((b) =>
                      b.type === "tool-call"
                        ? `tool:${b.toolName}`
                        : b.type === "interactive"
                          ? `interactive:${b.kind}`
                          : `text:${b.text.slice(0, 20)}`,
                    )
                    .join(", ")
                : `[no blocks] content=${m.content.slice(0, 40)}`;
              console.log(`  [${i}] role=${m.role} blocks=[${preview}]`);
            });
            console.groupEnd();
          }

          const consolidated = consolidateToolMessages(normalized);

          if (import.meta.env.DEV) {
            console.group("[chat.history] after consolidate");
            console.log(
              `total: ${consolidated.length} (was ${normalized.length})`,
            );
            consolidated.slice(0, 20).forEach((m, i) => {
              const blocks = m.contentBlocks;
              const preview = blocks
                ? blocks
                    .map((b) =>
                      b.type === "tool-call"
                        ? `tool:${b.toolName}`
                        : b.type === "interactive"
                          ? `interactive:${b.kind}`
                          : `text:${b.text.slice(0, 20)}`,
                    )
                    .join(", ")
                : `[no blocks] content=${m.content.slice(0, 40)}`;
              console.log(`  [${i}] role=${m.role} blocks=[${preview}]`);
            });
            console.groupEnd();
          }

          useChatStore.getState().setMessages(consolidated);
          useChatStore.getState().setMessagesLoading(false);
          break;
        }
        default:
          break;
      }
    };

    registerChatDispatch(dispatch);
    return () => {
      unregisterChatDispatch();
    };
  }, []);
}
