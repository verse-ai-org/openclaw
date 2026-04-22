export type ChatDebugLevel = "debug" | "warn" | "error";
export type ChatDebugChannel =
  | "chat"
  | "agent.lifecycle"
  | "agent.tool"
  | "agent.interaction"
  | "chat.finalize"
  | "chat.store"
  | "chat.history"
  | "session.history"
  | "session.list";

export type ChatDebugContext = {
  channel?: ChatDebugChannel;
  sessionKey?: string;
  runId?: string;
  state?: string;
  phase?: string;
};

/**
 * Verbose bridge logging (all `logChatDebug("debug", ...)` calls).
 * Enable in the browser console: `localStorage.setItem("openclaw.chatBridge.debug","1")`
 * (works in production builds; reload the page after setting).
 *
 * Covers: event bridge, finalize paths, `loadHistory` snapshots, `convertMessage` part
 * breakdown, `InteractiveParts` id resolution, etc. `warn`/`error` lines still print
 * without this flag (for real problems such as failed session list fetch).
 */
function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem("openclaw.chatBridge.debug") === "1";
  } catch {
    return false;
  }
}

function shouldLog(level: ChatDebugLevel): boolean {
  if (level === "warn" || level === "error") {
    return true;
  }
  return isDebugEnabled();
}

function isGroupEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  try {
    return localStorage.getItem("openclaw.chatBridge.group") === "1";
  } catch {
    return false;
  }
}

function summarizeContext(ctx?: ChatDebugContext): string {
  if (!ctx) {
    return "";
  }
  const parts = [
    ctx.channel ? `channel=${ctx.channel}` : "",
    ctx.sessionKey ? `session=${ctx.sessionKey}` : "",
    ctx.runId ? `run=${ctx.runId}` : "",
    ctx.state ? `state=${ctx.state}` : "",
    ctx.phase ? `phase=${ctx.phase}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(" ")})` : "";
}

function emit(
  level: ChatDebugLevel,
  message: string,
  data: unknown,
  ctx?: ChatDebugContext,
) {
  const line = `[chat-bridge:${level}]${summarizeContext(ctx)} ${message}`;
  if (level === "debug" && isGroupEnabled()) {
    console.groupCollapsed(line);
    if (data !== undefined) {
      console.debug(data);
    }
    console.groupEnd();
    return;
  }
  if (level === "debug") {
    if (data !== undefined) {
      console.debug(line, data);
    } else {
      console.debug(line);
    }
    return;
  }
  if (level === "warn") {
    if (data !== undefined) {
      console.warn(line, data);
    } else {
      console.warn(line);
    }
    return;
  }
  if (data !== undefined) {
    console.error(line, data);
  } else {
    console.error(line);
  }
}

export function logChatDebug(
  level: ChatDebugLevel,
  message: string,
  data?: unknown,
  ctx?: ChatDebugContext,
) {
  if (!shouldLog(level)) {
    return;
  }
  emit(level, message, data, ctx);
}
