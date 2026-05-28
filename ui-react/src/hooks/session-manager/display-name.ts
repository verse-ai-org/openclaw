import type { SessionEntry } from "./types";

const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;

function stripMessageIdHintLines(raw: string): string {
  if (!/\[message_id:/i.test(raw)) {
    return raw;
  }
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter((line) => !MESSAGE_ID_LINE.test(line));
  return filtered.length === lines.length ? raw : filtered.join("\n");
}

function stripTrailingSystemHintLines(raw: string): string {
  const lines = raw.split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1)?.trim() === "") {
    lines.pop();
  }
  while (lines.length > 0 && /^\[System:/i.test(lines.at(-1)?.trim() ?? "")) {
    lines.pop();
    while (lines.length > 0 && lines.at(-1)?.trim() === "") {
      lines.pop();
    }
  }
  return lines.join("\n").trim();
}

function stripLeadingFeishuSpeakerPrefix(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const first = lines[0]?.trim() ?? "";
  const stripped = first.replace(/^(ou_[a-z0-9]+):\s+/i, "");
  if (stripped === first) {
    return raw.trim();
  }
  lines[0] = stripped;
  return lines.join("\n").trim();
}

/**
 * Strip internal tags (<final>, <cron:...>, etc.), Markdown bold/italic/heading
 * noise from a raw session text string, then collapse whitespace.
 */
export function cleanSessionText(raw: string): string {
  let text = stripMessageIdHintLines(raw);
  text = stripTrailingSystemHintLines(text);
  text = stripLeadingFeishuSpeakerPrefix(text);
  return text
    // Fallback: strip <<<EXTERNAL_UNTRUSTED_CONTENT ...>>> blocks and everything after
    .replace(/<<<EXTERNAL_UNTRUSTED_CONTENT[\s\S]*/, "")
    // Drop "Untrusted context (metadata, ...)" header lines
    .replace(/^Untrusted context \(metadata[^\n]*/gim, "")
    // Drop inbound metadata prefix blocks: "Sender (untrusted metadata):", json fence, closing ```
    .replace(
      /^(?:Sender|Conversation info|Thread starter|Replied message|Forwarded message context|Chat history since last reply)\s*\([^)]*untrusted[^)]*\):[\s\S]*?```\s*$/gim,
      "",
    )
    // Remove XML-like tags: <final>, <cron:7d1b...>, etc.
    .replace(/<[^>]*>/g, "")
    // Remove Markdown bold/italic markers ** * __ _
    .replace(/\*{1,2}|_{1,2}/g, "")
    // Remove Markdown heading prefixes # ## ###
    .replace(/^#{1,6}\s*/gm, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function isUserSetSessionLabel(label: string | undefined): boolean {
  const trimmed = label?.trim();
  return Boolean(trimmed && trimmed !== "New Session");
}

/**
 * Resolve the best human-readable display name for a session.
 * Priority: label (user /label) > derivedTitle (first user message) > displayName > key tail
 */
export function resolveSessionDisplayName(session: SessionEntry): string {
  if (isUserSetSessionLabel(session.label)) {
    return cleanSessionText(session.label!);
  }
  const best = session.derivedTitle ?? session.displayName;
  if (best) {
    return cleanSessionText(best);
  }
  if (session.label?.trim()) {
    return cleanSessionText(session.label);
  }
  // Key fallback: take the last colon-separated segment.
  // e.g. "agent:abc123:8a3f1b2c" → "8a3f1b2c"
  return session.key.split(":").at(-1) ?? session.key;
}
