/**
 * Split an assistant text string on `<ask component="..." id="..."> ... </ask>`
 * tags emitted by the LLM for the first-class interaction protocol.
 *
 * We do NOT validate the payload body here — that's the backend parser's job
 * (`src/agents/interactions/ask-tag-parser.ts`). The UI only needs to:
 * 1. strip the raw tag so it doesn't show up in markdown;
 * 2. know where in the text the interaction widget should be rendered so the
 *    resulting `contentBlocks` preserve the LLM's original ordering.
 *
 * The `id` attribute is required; without it we can't bind the part to an
 * entry in `chat.store.interactions`, so the tag is left untouched in the
 * text (caller may still render it as raw text).
 *
 * Tags appearing inside a fenced code block (```) are deliberately NOT split —
 * this matches the backend parser behaviour and lets agents quote examples.
 *
 * Half-open tags (an `<ask ...>` without a matching `</ask>`) are preserved
 * as plain text so we never silently eat mid-stream model output.
 */

export type AskTagSplitPart =
  | { kind: "text"; text: string }
  | { kind: "interaction"; interactionId: string };

const OPEN_TAG_RE = /<ask(\s+[^>]*)?>/i;
const CLOSE_TAG = "</ask>";

function extractId(attrs: string | undefined): string | undefined {
  if (!attrs) return undefined;
  const re = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    if (m[1] === "id") {
      return m[2] ?? m[3] ?? m[4] ?? undefined;
    }
  }
  return undefined;
}

/**
 * Find the position of the next fence (triple-backtick at line start) in
 * `text` starting from `fromIdx`. Returns -1 if none.
 */
function findFenceAt(text: string, fromIdx: number): number {
  // We only care about fences at line start. A simple scan: look for "\n```"
  // or leading "```". This is a pragmatic approximation matching the backend
  // parser's FENCE_RE behaviour.
  if (fromIdx === 0 && text.startsWith("```")) return 0;
  const idx = text.indexOf("\n```", fromIdx);
  return idx === -1 ? -1 : idx + 1;
}

/**
 * Find the matching fence close for a fenced code block that opens at
 * `fenceOpenIdx`. Returns the index AFTER the closing fence, or text.length
 * if no close is found (unterminated fence — we treat the rest as fenced).
 */
function findFenceClose(text: string, fenceOpenIdx: number): number {
  // Skip the opening ``` line. Look for a line starting with ``` after it.
  const lineEnd = text.indexOf("\n", fenceOpenIdx);
  if (lineEnd === -1) return text.length;
  const nextFence = findFenceAt(text, lineEnd + 1);
  if (nextFence === -1) return text.length;
  // Advance past the closing fence line (until newline or EOF).
  const closeLineEnd = text.indexOf("\n", nextFence + 3);
  return closeLineEnd === -1 ? text.length : closeLineEnd + 1;
}

export type SplitAskTagsOptions = {
  /**
   * When true, an `<ask` open tag without a matching `</ask>` is truncated
   * (everything from `<ask` onward is dropped). Use this during live
   * streaming so the markdown renderer never flashes a half-formed XML tag
   * to the user. Defaults to `false`, i.e. unclosed tags are preserved as
   * plain text — appropriate for persisted content where a trailing open
   * tag should still round-trip.
   */
  hideUnclosed?: boolean;
};

export function splitAskTags(
  input: string,
  options: SplitAskTagsOptions = {},
): AskTagSplitPart[] {
  if (!input) return [];
  if (!input.includes("<ask")) return [{ kind: "text", text: input }];

  const parts: AskTagSplitPart[] = [];
  let cursor = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === "text") {
      last.text += t;
    } else {
      parts.push({ kind: "text", text: t });
    }
  };

  // Safety cap on iterations — one per `<ask` occurrence at most.
  for (let guard = 0; guard < 64; guard++) {
    if (cursor >= input.length) break;

    const remaining = input.slice(cursor);

    // If a fence opens before the next `<ask`, skip the fenced region wholesale.
    const fenceIdxRel = findFenceAt(remaining, 0);
    const openMatch = OPEN_TAG_RE.exec(remaining);

    if (!openMatch) {
      pushText(remaining);
      cursor = input.length;
      break;
    }

    if (fenceIdxRel !== -1 && fenceIdxRel < openMatch.index) {
      const fenceAbs = cursor + fenceIdxRel;
      const fenceCloseAbs = findFenceClose(input, fenceAbs);
      pushText(input.slice(cursor, fenceCloseAbs));
      cursor = fenceCloseAbs;
      continue;
    }

    const tagOpenAbs = cursor + openMatch.index;
    const tagBodyStartAbs = tagOpenAbs + openMatch[0].length;

    const closeRel = input.indexOf(CLOSE_TAG, tagBodyStartAbs);
    if (closeRel === -1) {
      // Unclosed tag.
      if (options.hideUnclosed) {
        // Streaming mode: flush prose up to the open tag and drop the rest
        // so we never flash partial XML to the markdown renderer.
        pushText(input.slice(cursor, tagOpenAbs));
      } else {
        // Static mode: preserve as-is so persisted content round-trips.
        pushText(input.slice(cursor));
      }
      cursor = input.length;
      break;
    }

    // Flush any prose between `cursor` and the opening tag.
    pushText(input.slice(cursor, tagOpenAbs));

    const interactionId = extractId(openMatch[1]);
    if (!interactionId) {
      // Without an id we can't bind to the store — keep the raw tag in text so
      // the model output isn't silently dropped.
      pushText(input.slice(tagOpenAbs, closeRel + CLOSE_TAG.length));
    } else {
      parts.push({ kind: "interaction", interactionId });
    }

    cursor = closeRel + CLOSE_TAG.length;
  }

  return parts;
}

/**
 * Convenience: strip all `<ask>...</ask>` blocks from text, returning the
 * remaining prose concatenated. Use when you only need the visible text
 * (e.g. backward-compat `content` string on a ChatMessage).
 */
export function stripAskTags(input: string): string {
  return splitAskTags(input)
    .filter((p): p is Extract<AskTagSplitPart, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * Walk a `ContentBlock[]` and, for every `text` block whose body contains
 * `<ask ...>...</ask>` markup, replace it with a sequence of sibling blocks:
 *
 *   [text(prose-before)] + [interaction(id)] + [text(prose-after)]
 *
 * Non-text blocks and `<ask>`-free text blocks pass through unchanged. The
 * input array is never mutated. Returns a new array only when something was
 * actually hoisted, otherwise the original reference is returned (cheap
 * identity-comparison for callers that skip work when nothing changed).
 *
 * This is a pure shape transform — the caller is still responsible for
 * populating the matching `InteractionState` in the chat store (via the
 * `interaction` agent event or by materializing it from a history row).
 */
export function hoistAskTagsInContentBlocks<
  B extends { type: string } & Record<string, unknown>,
>(blocks: readonly B[] | undefined): B[] | undefined {
  if (!blocks || blocks.length === 0) return blocks as B[] | undefined;
  // Fast-path: nothing to do when no text block contains a tag marker.
  const hasAskCandidate = blocks.some(
    (b) =>
      b.type === "text" &&
      typeof (b as unknown as { text?: unknown }).text === "string" &&
      ((b as unknown as { text: string }).text.includes("<ask")),
  );
  if (!hasAskCandidate) return blocks as B[];

  const out: B[] = [];
  for (const block of blocks) {
    if (block.type !== "text") {
      out.push(block);
      continue;
    }
    const text = (block as unknown as { text: string }).text;
    const split = splitAskTags(text);
    if (split.length === 1 && split[0]!.kind === "text") {
      out.push(block);
      continue;
    }
    for (const piece of split) {
      if (piece.kind === "interaction") {
        out.push({
          type: "interaction",
          interactionId: piece.interactionId,
        } as unknown as B);
      } else if (piece.text.length > 0) {
        out.push({ type: "text", text: piece.text } as unknown as B);
      }
    }
  }
  return out;
}
