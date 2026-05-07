/**
 * Strip agent wrapper tags from persisted/streamed assistant text before UI display.
 */
const AGENT_COMPLETE_TAG_RE = /^\s*<(final|plan)>([\s\S]*?)<\/\1>\s*$/i;
const AGENT_OPEN_TAG_RE = /^\s*<(?:final|plan)>\n?/i;
const AGENT_CLOSE_TAG_RE = /\n?<\/(?:final|plan)>\s*$/i;

export function stripAgentWrapperTags(text: string): string {
  let result = text;
  let match: RegExpMatchArray | null;
  while ((match = result.match(AGENT_COMPLETE_TAG_RE))) {
    result = match[2] ?? "";
  }
  result = result.replace(AGENT_OPEN_TAG_RE, "");
  result = result.replace(AGENT_CLOSE_TAG_RE, "");
  if (!/<\/(?:final|plan)>\s*$/iu.test(result)) {
    result = result.replace(/<\/(?:final|plan)?$/iu, "");
  }
  return result.trim();
}
