/**
 * Single source for the Control UI “active” chat session key (matches
 * GatewayChatRuntimeProvider + chat.send / bridge session scoping).
 *
 * Precedence: first non-blank trimmed `chatSessionKey`, else first non-blank
 * trimmed `settingsSessionKey`, else `"main"`.
 */
export function resolveActiveChatSessionKey(
  chatSessionKey: string | null | undefined,
  settingsSessionKey: string | null | undefined,
): string {
  if (typeof chatSessionKey === "string" && chatSessionKey.trim()) {
    return chatSessionKey.trim();
  }
  if (typeof settingsSessionKey === "string" && settingsSessionKey.trim()) {
    return settingsSessionKey.trim();
  }
  return "main";
}

