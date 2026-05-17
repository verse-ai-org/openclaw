import { mainLogSync } from "./onboarding.js";

/** Set `BOSSIM_LOG_VERBOSE=1` to mirror routine info lines into electron-main.log */
export function isMainLogVerbose(): boolean {
  return (
    process.env.BOSSIM_LOG_VERBOSE === "1" ||
    process.env.OPENCLAW_ELECTRON_LOG_VERBOSE === "1"
  );
}

// oxlint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/** Routine detail: console in dev; file only when verbose. */
export function mainLogInfo(message: string): void {
  console.log(message);
  if (isMainLogVerbose()) {
    mainLogSync(message);
  }
}

/** Warnings always go to the log file. */
export function mainLogWarn(message: string): void {
  console.warn(message);
  mainLogSync(`[WARN] ${message}`);
}

/** Errors always go to the log file. */
export function mainLogError(message: string, err?: unknown): void {
  const detail =
    err instanceof Error
      ? ` ${err.message}`
      : err !== undefined
        ? ` ${String(err)}`
        : "";
  console.error(message + detail);
  mainLogSync(`[ERROR] ${message}${detail}`);
}

/** Important milestones (startup ready, gateway spawned, etc.). */
export function mainLogNote(message: string): void {
  console.log(message);
  mainLogSync(message);
}

/** Gateway child stdout: keep warnings/errors and a few readiness hints. */
export function shouldLogGatewayStdoutLine(rawLine: string): boolean {
  const line = stripAnsi(rawLine).trim();
  if (!line) {
    return false;
  }
  if (/doctor\s+warnings/i.test(line)) {
    return true;
  }
  if (/run "openclaw doctor/i.test(line)) {
    return true;
  }
  const lower = line.toLowerCase();
  if (/\b(error|failed|failure|fatal|exception)\b/.test(lower)) {
    return true;
  }
  if (/\bwarn(ing|ings)?\b/.test(lower)) {
    return true;
  }
  if (/listening on ws:\/\//i.test(line)) {
    return true;
  }
  // Doctor / config hints (box drawing may remain after stripAnsi)
  if (/allowfrom|dmPolicy|openclaw doctor/i.test(line)) {
    return true;
  }
  return false;
}

/** Gateway child stderr is always worth recording. */
export function formatGatewayChildLine(tag: "stdout" | "stderr", rawLine: string): string {
  const plain = stripAnsi(rawLine).trim();
  if (!plain) {
    return "";
  }
  return `[gateway:${tag}] ${plain}`;
}
