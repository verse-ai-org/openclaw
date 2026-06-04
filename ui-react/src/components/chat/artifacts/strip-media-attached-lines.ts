/** Strip gateway-injected `[media attached: ...]` lines from display text. */
const MEDIA_ATTACHED_LINE =
  /^\[media attached(?:\s+\d+\/\d+)?:\s*[^\]]+\]$/i;

export function stripMediaAttachedDisplayLines(message: string): string {
  const lines = message.split(/\r?\n/);
  const kept = lines.filter((line) => !MEDIA_ATTACHED_LINE.test(line.trim()));
  return kept.join("\n").trimEnd();
}
