export function extractTextFromToolResultBlock(
  block: Record<string, unknown>,
): string | undefined {
  if (typeof block.text === "string") {
    return block.text;
  }
  if (typeof block.content === "string") {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    return (block.content as Array<Record<string, unknown>>)
      .filter(
        (b) => (b.type as string) === "text" && typeof b.text === "string",
      )
      .map((b) => b.text as string)
      .join("");
  }
  return undefined;
}

/** Error UI follows server/toolResult `isError` only — no client-side inference. */
export function resolveToolResultPhase(
  block: Record<string, unknown>,
): "result" | "error" {
  return block.isError === true ? "error" : "result";
}
