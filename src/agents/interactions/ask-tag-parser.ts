import {
  getInteractionManifest,
  type ParsedAskTag,
} from "@openclaw/interactions";

/**
 * Streaming parser for `<ask component="..." id="..."> ...JSON... </ask>`
 * tags that the LLM emits in assistant text to request structured input.
 *
 * Usage:
 * ```ts
 * const parser = createAskTagStreamParser({
 *   onComplete: (tag) => { ... },
 *   onText: (text) => { ... }, // everything that's NOT inside a tag
 * });
 * parser.push(streamChunk);
 * parser.end();
 * ```
 *
 * Design choices:
 * - The parser only triggers on tags that appear at the top level of the
 *   stream, not ones nested inside fenced code blocks. This matches the
 *   behaviour of `<final>` / `<plan>` tags elsewhere in the repo and avoids
 *   collisions when the LLM quotes example usage.
 * - If the JSON payload fails to parse, we emit the tag as plain text via
 *   `onText`, so the surrounding chat turn still renders something useful.
 * - If the payload parses but fails the component's Zod schema, `onComplete`
 *   is NOT called; instead a string error is reported via `onInvalid`. The
 *   runner upstream can decide whether to fall through as plain text.
 */
export interface AskTagStreamCallbacks {
  onText: (text: string) => void;
  onComplete: (tag: ParsedAskTag) => void;
  onInvalid?: (
    info: { component: string; id: string; reason: string; rawBody: string },
  ) => void;
}

interface ParserState {
  buffer: string;
  inTag: boolean;
  inFence: boolean;
  tagOpen?: { attrs: Record<string, string>; bodyStart: number };
}

const OPEN_TAG_RE = /<ask(\s+[^>]*)?>/i;
const CLOSE_TAG = "</ask>";
const FENCE_RE = /^```/m;

function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  // attr="value" | attr='value' | attr=value(no-quotes-until-space)
  const re = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    out[m[1]!] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

export interface AskTagStreamParser {
  push(chunk: string): void;
  end(): void;
}

export function createAskTagStreamParser(
  cb: AskTagStreamCallbacks,
): AskTagStreamParser {
  const state: ParserState = { buffer: "", inTag: false, inFence: false };

  const flushPlainText = (upto: number) => {
    if (upto <= 0) return;
    const text = state.buffer.slice(0, upto);
    if (text) cb.onText(text);
    state.buffer = state.buffer.slice(upto);
  };

  const tryAdvance = () => {
    // Consume as much of the buffer as we can. A loop because one tag may
    // be followed by text which itself contains another tag.
    // Safety cap: the loop is bounded by the number of `<ask` occurrences
    // in the current buffer.
    for (let i = 0; i < 32; i++) {
      if (state.inTag) {
        // Look for close.
        const closeIdx = state.buffer.indexOf(CLOSE_TAG);
        if (closeIdx === -1) return; // need more data
        const body = state.buffer.slice(0, closeIdx);
        const afterIdx = closeIdx + CLOSE_TAG.length;
        handleTagBody(body);
        state.buffer = state.buffer.slice(afterIdx);
        state.inTag = false;
        continue;
      }

      // Not inside a tag: honor code fences to avoid firing on examples.
      // We approximate fenced blocks by toggling `inFence` on each
      // triple-backtick-at-line-start we see. For streaming, we process up
      // to the last complete character we've buffered.
      const fenceMatch = FENCE_RE.exec(state.buffer);
      const openMatch = OPEN_TAG_RE.exec(state.buffer);
      if (!openMatch) {
        // No opening tag — everything currently buffered is plain text,
        // EXCEPT we should keep a small trailing tail in case a tag is
        // just arriving next chunk.
        const tail = Math.max(0, state.buffer.length - "<ask".length);
        flushPlainText(tail);
        return;
      }
      if (fenceMatch && fenceMatch.index < openMatch.index) {
        // Flush everything up to after the fence marker as plain text; we
        // intentionally ignore tag parsing inside fences, matching the
        // `<final>/<plan>` convention.
        const endOfFence = fenceMatch.index + fenceMatch[0].length;
        flushPlainText(endOfFence);
        continue;
      }

      const tagStart = openMatch.index;
      const tagEndInside = openMatch[0].length;
      flushPlainText(tagStart);
      // buffer now starts with the `<ask ...>`.
      const attrs = parseAttrs(openMatch[1] ?? "");
      state.tagOpen = { attrs, bodyStart: tagEndInside };
      state.buffer = state.buffer.slice(tagEndInside);
      state.inTag = true;
    }
  };

  const handleTagBody = (body: string) => {
    const attrs = state.tagOpen?.attrs ?? {};
    const component = attrs.component ?? "";
    const id = attrs.id ?? "";
    const reset = () => {
      state.tagOpen = undefined;
    };
    if (!component || !id) {
      cb.onInvalid?.({
        component,
        id,
        reason: "missing required attribute component or id",
        rawBody: body,
      });
      reset();
      return;
    }
    const manifest = getInteractionManifest(component);
    if (!manifest) {
      cb.onInvalid?.({
        component,
        id,
        reason: `unknown interaction component "${component}"`,
        rawBody: body,
      });
      reset();
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body.trim());
    } catch (err) {
      cb.onInvalid?.({
        component,
        id,
        reason: `invalid JSON: ${(err as Error).message}`,
        rawBody: body,
      });
      reset();
      return;
    }
    const result = manifest.requestSchema.safeParse(payload);
    if (!result.success) {
      cb.onInvalid?.({
        component,
        id,
        reason: `payload validation failed: ${result.error.message}`,
        rawBody: body,
      });
      reset();
      return;
    }
    cb.onComplete({
      component,
      interactionId: id,
      payload: result.data,
      cancellable: attrs.cancellable === "true",
      timeoutMs: attrs.timeoutMs ? Number(attrs.timeoutMs) : undefined,
    });
    reset();
  };

  return {
    push(chunk: string) {
      if (!chunk) return;
      state.buffer += chunk;
      tryAdvance();
    },
    end() {
      // Flush whatever is left as plain text (including a possibly half-open
      // tag — the LLM dropped the close, we don't hallucinate completion).
      if (state.inTag && state.buffer.length > 0) {
        // Emit the unclosed body back as plain text so we don't silently
        // eat model output.
        cb.onText(`<ask ${Object.entries(state.tagOpen?.attrs ?? {})
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}>${state.buffer}`);
        state.buffer = "";
        state.inTag = false;
        state.tagOpen = undefined;
        return;
      }
      if (state.buffer) cb.onText(state.buffer);
      state.buffer = "";
    },
  };
}
