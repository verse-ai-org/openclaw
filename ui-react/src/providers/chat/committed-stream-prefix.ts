import type { ContentBlock } from "@/store/chat.store";

/**
 * Plain-text prefix represented by committed assistant `text` blocks, in order.
 * Gateway `chat` deltas use one cumulative string (no newlines between segments), so
 * we concatenate without inserting `\n` — using `join("\n")` breaks `startsWith`
 * matching and causes duplicate text in `__stream__` after multiple commits.
 */
export function committedAssistantPlainPrefix(committedBlocks: ContentBlock[]): string {
  return committedBlocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Strip the cumulative prefix already captured in `committedBlocks` from `stream`. */
export function sliceStreamAfterCommittedAssistant(
  stream: string,
  committedBlocks: ContentBlock[],
): string {
  if (!stream) {
    return stream;
  }
  const prefix = committedAssistantPlainPrefix(committedBlocks);
  if (!prefix) {
    return stream;
  }
  if (stream.startsWith(prefix)) {
    return stream.slice(prefix.length);
  }
  return stream;
}
