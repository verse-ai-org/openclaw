import {
  formatGatewayChildLine,
  isMainLogVerbose,
  mainLogInfo,
  mainLogNote,
  mainLogWarn,
  shouldLogGatewayStdoutLine,
  stripAnsi,
} from "../logger.js";

type GatewayLogKind = "info" | "note" | "warn";

/**
 * Structured gateway log line for easier grep/filter.
 * Example: [gateway][spawn] port=18789 force=false
 */
function formatEventLine(event: string, fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) {
    return `[gateway][${event}]`;
  }
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return `[gateway][${event}] ${kv}`;
}

export function logEvent(
  event: string,
  fields?: Record<string, unknown>,
  kind: GatewayLogKind = "info",
): void {
  const line = formatEventLine(event, fields);
  if (kind === "note") {
    mainLogNote(line);
  } else if (kind === "warn") {
    mainLogWarn(line);
  } else {
    mainLogInfo(line);
  }
}

/**
 * Normalise child process output; only warnings/errors land in electron-main.log.
 */
export function writeChildStream(tag: "stdout" | "stderr", text: string): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const plain = stripAnsi(trimmed);
    const shouldFile = tag === "stderr" || shouldLogGatewayStdoutLine(plain);
    if (tag === "stdout") {
      if (isMainLogVerbose() || shouldFile) {
        process.stdout.write(`[gateway:stdout] ${plain}\n`);
      }
    } else {
      process.stderr.write(`[gateway:stderr] ${plain}\n`);
    }
    if (shouldFile) {
      const formatted = formatGatewayChildLine(tag, plain);
      if (formatted) {
        if (tag === "stderr") {
          mainLogWarn(formatted);
        } else {
          mainLogNote(formatted);
        }
      }
    }
  }
}

export function logAuditOk(event: string, message: string): void {
  mainLogInfo(`[gateway][${event}] ${message}`);
}
