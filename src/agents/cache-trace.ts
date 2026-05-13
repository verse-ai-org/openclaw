import crypto from "node:crypto";
import path from "node:path";
import type { AgentMessage, StreamFn } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import { parseBooleanValue } from "../utils/boolean.js";
import { safeJsonStringify } from "../utils/safe-json.js";
import { redactImageDataForDiagnostics } from "./payload-redaction.js";
import { getQueuedFileWriter, type QueuedFileWriter } from "./queued-file-writer.js";
import { buildAgentTraceBase } from "./trace-base.js";

export type CacheTraceStage =
  | "session:loaded"
  | "session:sanitized"
  | "session:limited"
  | "prompt:before"
  | "prompt:images"
  | "stream:context"
  | "session:after";

export type CacheTraceEvent = {
  ts: string;
  seq: number;
  stage: CacheTraceStage;
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  workspaceDir?: string;
  prompt?: string;
  system?: unknown;
  options?: Record<string, unknown>;
  model?: Record<string, unknown>;
  messages?: AgentMessage[];
  messageCount?: number;
  messageRoles?: Array<string | undefined>;
  messageFingerprints?: string[];
  messagesDigest?: string;
  systemDigest?: string;
  note?: string;
  error?: string;
};

export type CacheTrace = {
  enabled: true;
  filePath: string;
  recordStage: (stage: CacheTraceStage, payload?: Partial<CacheTraceEvent>) => void;
  wrapStreamFn: (streamFn: StreamFn) => StreamFn;
};

type CacheTraceInit = {
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  workspaceDir?: string;
  writer?: CacheTraceWriter;
};

type CacheTraceConfig = {
  enabled: boolean;
  filePath: string;
  includeMessages: boolean;
  includePrompt: boolean;
  includeSystem: boolean;
};

type CacheTraceWriter = QueuedFileWriter;

const log = createSubsystemLogger("agent/cache-trace");
const writers = new Map<string, CacheTraceWriter>();

function resolveCacheTraceConfig(params: CacheTraceInit): CacheTraceConfig {
  const env = params.env ?? process.env;
  const config = params.cfg?.diagnostics?.cacheTrace;
  const envEnabled = parseBooleanValue(env.OPENCLAW_CACHE_TRACE);
  const enabled = envEnabled ?? config?.enabled ?? false;
  const fileOverride = config?.filePath?.trim() || env.OPENCLAW_CACHE_TRACE_FILE?.trim();
  const filePath = fileOverride
    ? resolveUserPath(fileOverride)
    : path.join(resolveStateDir(env), "logs", "cache-trace.jsonl");

  const includeMessages =
    parseBooleanValue(env.OPENCLAW_CACHE_TRACE_MESSAGES) ?? config?.includeMessages;
  const includePrompt = parseBooleanValue(env.OPENCLAW_CACHE_TRACE_PROMPT) ?? config?.includePrompt;
  const includeSystem = parseBooleanValue(env.OPENCLAW_CACHE_TRACE_SYSTEM) ?? config?.includeSystem;

  return {
    enabled,
    filePath,
    includeMessages: includeMessages ?? true,
    includePrompt: includePrompt ?? true,
    includeSystem: includeSystem ?? true,
  };
}

function getWriter(filePath: string): CacheTraceWriter {
  return getQueuedFileWriter(writers, filePath);
}

function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return JSON.stringify(String(value));
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (seen.has(value)) {
    return JSON.stringify("[Circular]");
  }
  seen.add(value);
  if (value instanceof Error) {
    return stableStringify(
      {
        name: value.name,
        message: value.message,
        stack: value.stack,
      },
      seen,
    );
  }
  if (value instanceof Uint8Array) {
    return stableStringify(
      {
        type: "Uint8Array",
        data: Buffer.from(value).toString("base64"),
      },
      seen,
    );
  }
  if (Array.isArray(value)) {
    const serializedEntries: string[] = [];
    for (const entry of value) {
      serializedEntries.push(stableStringify(entry, seen));
    }
    return `[${serializedEntries.join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const serializedFields: string[] = [];
  for (const key of Object.keys(record).toSorted()) {
    serializedFields.push(`${JSON.stringify(key)}:${stableStringify(record[key], seen)}`);
  }
  return `{${serializedFields.join(",")}}`;
}

function digest(value: unknown): string {
  const serialized = stableStringify(value);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function summarizeMessages(messages: AgentMessage[]): {
  messageCount: number;
  messageRoles: Array<string | undefined>;
  messageFingerprints: string[];
  messagesDigest: string;
} {
  const messageFingerprints = messages.map((msg) => digest(msg));
  return {
    messageCount: messages.length,
    messageRoles: messages.map((msg) => (msg as { role?: string }).role),
    messageFingerprints,
    messagesDigest: digest(messageFingerprints.join("|")),
  };
}

export function createCacheTrace(params: CacheTraceInit): CacheTrace | null {
  const cfg = resolveCacheTraceConfig(params);
  if (!cfg.enabled) {
    return null;
  }

  const writer = params.writer ?? getWriter(cfg.filePath);
  let seq = 0;

  const base: Omit<CacheTraceEvent, "ts" | "seq" | "stage"> = buildAgentTraceBase(params);

  const consoleLogStage = (stage: CacheTraceStage, summary: Record<string, unknown>) => {
    const parts = [`[cache-trace] stage=${stage}`];
    if (params.sessionKey) parts.push(`session=${params.sessionKey}`);
    for (const [k, v] of Object.entries(summary)) {
      if (v !== undefined && v !== null) parts.push(`${k}=${v}`);
    }
    log.info(parts.join(" "));
  };

  const recordStage: CacheTrace["recordStage"] = (stage, payload = {}) => {
    const event: CacheTraceEvent = {
      ...base,
      ts: new Date().toISOString(),
      seq: (seq += 1),
      stage,
    };

    const consoleSummary: Record<string, unknown> = {};

    if (payload.prompt !== undefined && cfg.includePrompt) {
      event.prompt = payload.prompt;
      consoleSummary.promptChars = String(payload.prompt).length;
    }
    if (payload.system !== undefined && cfg.includeSystem) {
      event.system = payload.system;
      event.systemDigest = digest(payload.system);
      consoleSummary.systemChars =
        typeof payload.system === "string" ? payload.system.length : "object";
    }
    if (payload.options) {
      event.options = redactImageDataForDiagnostics(payload.options) as Record<string, unknown>;
    }
    if (payload.model) {
      event.model = payload.model;
      const m = payload.model as Record<string, unknown>;
      if (m.provider || m.id) consoleSummary.model = `${m.provider ?? "?"}/${m.id ?? "?"}`;
    }

    const messages = payload.messages;
    if (Array.isArray(messages)) {
      const summary = summarizeMessages(messages);
      event.messageCount = summary.messageCount;
      event.messageRoles = summary.messageRoles;
      event.messageFingerprints = summary.messageFingerprints;
      event.messagesDigest = summary.messagesDigest;
      consoleSummary.msgCount = summary.messageCount;
      consoleSummary.msgRoles = summary.messageRoles.join(",");
      if (cfg.includeMessages) {
        event.messages = redactImageDataForDiagnostics(messages) as AgentMessage[];
      }
    }

    if (payload.note) {
      event.note = payload.note;
      consoleSummary.note = payload.note;
    }
    if (payload.error) {
      event.error = payload.error;
      consoleSummary.error = payload.error;
    }

    consoleLogStage(stage, consoleSummary);

    const line = safeJsonStringify(event);
    if (!line) {
      return;
    }
    writer.write(`${line}\n`);
  };

  const wrapStreamFn: CacheTrace["wrapStreamFn"] = (streamFn) => {
    const wrapped: StreamFn = (model, context, options) => {
      recordStage("stream:context", {
        model: {
          id: model?.id,
          provider: model?.provider,
          api: model?.api,
        },
        system: (context as { system?: unknown }).system,
        messages: (context as { messages?: AgentMessage[] }).messages ?? [],
        options: (options ?? {}) as Record<string, unknown>,
      });
      return streamFn(model, context, options);
    };
    return wrapped;
  };

  log.info(
    `[cache-trace] enabled file=${cfg.filePath} includeMessages=${cfg.includeMessages} includePrompt=${cfg.includePrompt} includeSystem=${cfg.includeSystem}`,
  );

  // Also write directly to stderr so it's visible even if logger console is suppressed
  process.stderr.write(
    `[gateway:cache-trace] enabled file=${cfg.filePath}\n`,
  );

  return {
    enabled: true,
    filePath: cfg.filePath,
    recordStage,
    wrapStreamFn,
  };
}
