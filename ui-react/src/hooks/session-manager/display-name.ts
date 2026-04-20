import type { SessionEntry } from "./types";

/**
 * Strip internal tags (<final>, <cron:...>, etc.), Markdown bold/italic/heading
 * noise from a raw session text string, then collapse whitespace.
 */
export function cleanSessionText(raw: string): string {
  return (
    raw
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
      .trim()
  );
}

/**
 * Resolve the best human-readable display name for a session.
 * Priority: displayName > derivedTitle > label > key (tail segment)
 */
export function resolveSessionDisplayName(session: SessionEntry): string {
  const best = session.displayName ?? session.derivedTitle ?? session.label;
  if (best) {
    return cleanSessionText(best);
  }
  // Key fallback: take the last colon-separated segment.
  // e.g. "agent:abc123:8a3f1b2c" → "8a3f1b2c"
  return session.key.split(":").at(-1) ?? session.key;
}
