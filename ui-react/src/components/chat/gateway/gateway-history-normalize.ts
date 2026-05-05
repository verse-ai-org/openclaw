/**
 * Pre-process a raw Gateway history message array:
 * merge standalone toolResult messages into the preceding assistant message's
 * content array, then filter out the toolResult messages.
 */
export function mergeToolResults(rawMessages: unknown[]): unknown[] {
  const out: Record<string, unknown>[] = [];

  for (const raw of rawMessages) {
    const msg = raw as Record<string, unknown>;
    const roleStr = ((msg.role as string) ?? "")
      .toLowerCase()
      .replace(/_/g, "");

    if (roleStr === "toolresult" || roleStr === "tool") {
      for (let i = out.length - 1; i >= 0; i--) {
        const prev = out[i];
        const prevRole = ((prev.role as string) ?? "")
          .toLowerCase()
          .replace(/_/g, "");
        if (prevRole === "toolresult" || prevRole === "tool") {
          continue;
        }
        const prevContent = Array.isArray(prev.content)
          ? (prev.content as Array<Record<string, unknown>>)
          : [];
        const pairedIds = new Set(
          prevContent
            .filter((b) => (b.type as string) === "toolresult")
            .map((b) => b.toolCallId as string)
            .filter(Boolean),
        );

        // Prefer the toolCallId carried by the toolResult message itself.
        // This correctly handles multiple parallel tool calls in one assistant turn.
        const explicitToolCallId =
          typeof msg.toolCallId === "string" && msg.toolCallId.trim()
            ? (msg.toolCallId as string)
            : undefined;

        const unpaired = prevContent.find(
          (b) =>
            (b.type as string) === "toolCall" &&
            typeof b.id === "string" &&
            !pairedIds.has(b.id),
        );
        const toolCallId =
          explicitToolCallId ?? (unpaired?.id as string | undefined);

        const rawContent = Array.isArray(msg.content)
          ? (msg.content as Array<Record<string, unknown>>)
          : [];
        const resultText = rawContent
          .filter(
            (b) => (b.type as string) === "text" && typeof b.text === "string",
          )
          .map((b) => b.text as string)
          .join("");
        const resultBlock: Record<string, unknown> = {
          type: "toolresult",
          text: resultText,
          ...(toolCallId ? { toolCallId } : {}),
        };
        if (typeof msg.isError === "boolean") {
          resultBlock.isError = msg.isError;
        }

        out[i] = { ...prev, content: [...prevContent, resultBlock] };
        break;
      }
    } else {
      out.push({ ...msg });
    }
  }

  return out;
}

