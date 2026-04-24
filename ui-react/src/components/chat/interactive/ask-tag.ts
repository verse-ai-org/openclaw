import { createInteractiveBlock } from "@/hooks/chat-event-bridge/interactive-blocks";
import type { InteractiveContentBlock, InteractiveKind } from "@/store/chat.store";

const ASK_TAG_RE =
  /<ask\s+([^>]*?)>([\s\S]*?)<\/ask>/gi;
const LEGACY_INTERACTION_TAG_RE =
  /<(option_list|question_flow|approval_card)\s+([^>]*?)>([\s\S]*?)<\/\1>/gi;

export type AskTagParseErrorReason =
  | "missing_attributes"
  | "empty_payload"
  | "invalid_json"
  | "invalid_component_or_payload";

export interface AskTagParseError {
  reason: AskTagParseErrorReason;
  rawTag: string;
  component?: string;
  id?: string;
  payloadText?: string;
}

export interface AskTagParseResult {
  blocks: InteractiveContentBlock[];
  errors: AskTagParseError[];
  validTagRanges: Array<{ start: number; end: number }>;
  allTagRanges: Array<{ start: number; end: number }>;
}

export function formatAskParseErrorReason(reason: AskTagParseErrorReason): string {
  switch (reason) {
    case "missing_attributes":
      return "缺少 component 或 id 属性";
    case "empty_payload":
      return "ask payload 为空";
    case "invalid_json":
      return "ask payload 不是合法 JSON";
    case "invalid_component_or_payload":
      return "组件类型不支持或 payload 结构无效";
    default:
      return "未知解析错误";
  }
}

function parseAskAttributes(raw: string): { component?: string; id?: string } {
  const attrs: { component?: string; id?: string } = {};
  const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null = null;
  while ((match = attrRe.exec(raw))) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) {
      continue;
    }
    if (key === "component") {
      attrs.component = value;
    } else if (key === "id") {
      attrs.id = value;
    }
  }
  return attrs;
}

function parseLegacyAttributes(
  component: "option_list" | "question_flow" | "approval_card",
  raw: string,
): { component?: string; id?: string } {
  const attrs = parseAskAttributes(raw);
  return { component, id: attrs.id };
}

export function parseAskTags(text: string): AskTagParseResult {
  ASK_TAG_RE.lastIndex = 0;
  LEGACY_INTERACTION_TAG_RE.lastIndex = 0;
  const blocks: InteractiveContentBlock[] = [];
  const errors: AskTagParseError[] = [];
  const validTagRanges: Array<{ start: number; end: number }> = [];
  const allTagRanges: Array<{ start: number; end: number }> = [];
  const matches: Array<{
    rawTag: string;
    start: number;
    attrs: { component?: string; id?: string };
    payloadText: string;
  }> = [];

  let match: RegExpExecArray | null = null;
  while ((match = ASK_TAG_RE.exec(text))) {
    matches.push({
      rawTag: match[0] ?? "",
      start: match.index,
      attrs: parseAskAttributes(match[1] ?? ""),
      payloadText: (match[2] ?? "").trim(),
    });
  }
  while ((match = LEGACY_INTERACTION_TAG_RE.exec(text))) {
    const component = (match[1] ?? "").trim() as
      | "option_list"
      | "question_flow"
      | "approval_card";
    matches.push({
      rawTag: match[0] ?? "",
      start: match.index,
      attrs: parseLegacyAttributes(component, match[2] ?? ""),
      payloadText: (match[3] ?? "").trim(),
    });
  }

  matches.sort((a, b) => a.start - b.start);

  for (const item of matches) {
    const rawTag = item.rawTag;
    const attrs = item.attrs;
    const payloadText = item.payloadText;
    allTagRanges.push({ start: item.start, end: item.start + rawTag.length });
    if (!attrs.component || !attrs.id || !payloadText) {
      errors.push({
        reason:
          !attrs.component || !attrs.id ? "missing_attributes" : "empty_payload",
        rawTag,
        component: attrs.component,
        id: attrs.id,
        payloadText,
      });
      continue;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      errors.push({
        reason: "invalid_json",
        rawTag,
        component: attrs.component,
        id: attrs.id,
        payloadText,
      });
      continue;
    }
    const block = createInteractiveBlock({
      interactiveId: attrs.id,
      kind: attrs.component as InteractiveKind,
      payload,
    });
    if (block) {
      blocks.push(block);
      const start = item.start;
      validTagRanges.push({ start, end: start + rawTag.length });
    } else {
      errors.push({
        reason: "invalid_component_or_payload",
        rawTag,
        component: attrs.component,
        id: attrs.id,
        payloadText,
      });
    }
  }
  return { blocks, errors, validTagRanges, allTagRanges };
}

export function stripValidAskTags(text: string): string {
  const parsed = parseAskTags(text);
  if (parsed.validTagRanges.length === 0) {
    return text.trim();
  }

  let cursor = 0;
  let out = "";
  for (const range of parsed.validTagRanges) {
    out += text.slice(cursor, range.start);
    cursor = range.end;
  }
  out += text.slice(cursor);
  return out.trim();
}

export function stripAllAskTags(text: string): string {
  const parsed = parseAskTags(text);
  if (parsed.allTagRanges.length === 0) {
    return text.trim();
  }

  let cursor = 0;
  let out = "";
  for (const range of parsed.allTagRanges) {
    out += text.slice(cursor, range.start);
    cursor = range.end;
  }
  out += text.slice(cursor);
  return out.trim();
}

export function extractInteractiveBlocksFromAskTags(text: string): InteractiveContentBlock[] {
  return parseAskTags(text).blocks;
}

export function extractAskParseErrorsFromText(text: string): AskTagParseError[] {
  return parseAskTags(text).errors;
}

export function extractAskFallbackQuestions(text: string): string[] {
  const { errors } = parseAskTags(text);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const err of errors) {
    const payloadText = err.payloadText ?? "";
    const titleRe = /"title"\s*:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null = null;
    while ((m = titleRe.exec(payloadText))) {
      const t = (m[1] ?? "").trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}
