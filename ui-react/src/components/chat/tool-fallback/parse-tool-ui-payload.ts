/**
 * Normalize tool `result` / `resultStr` into a JSON object for Tool UI safe-parsers.
 */
export function parseToolUiPayload(
  result: unknown,
  resultStr: string | undefined,
): Record<string, unknown> | null {
  let raw: unknown = result;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const s = typeof raw === "string" ? raw : resultStr;
  if (typeof s !== "string") {
    return null;
  }
  try {
    const t = s.trim();
    if (!t.startsWith("{")) {
      return null;
    }
    const parsed: unknown = JSON.parse(t);
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
