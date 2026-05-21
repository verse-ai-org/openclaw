import type { MsgContext } from "../../auto-reply/templating.js";
import { normalizeMessageChannel } from "../../utils/message-channel.js";
import { mutateConfigFile } from "../config.js";
import type { OpenClawConfig } from "../types.js";
import type { SessionIdentityHints } from "./types.js";

/** Reserved canonical for auto-learned channel targets without a stable sender id. */
export const LEARNED_IDENTITY_CANONICAL = "__openclaw.learned";

const FEISHU_CHANNEL_ALIASES = new Set(["feishu", "lark"]);
const WEIXIN_CHANNEL_ALIASES = new Set(["openclaw-weixin", "weixin", "wechat", "wx", "微信"]);

function normalizeCanonicalSender(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("ou_") || lower.startsWith("on_")) {
    return trimmed;
  }
  if (/^wxid_[a-z0-9_-]+$/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.endsWith("@im.wechat")) {
    return trimmed.split("@")[0] ?? trimmed;
  }
  return undefined;
}

function formatFeishuAlias(target: string): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) {
    return undefined;
  }
  const userId = trimmed.replace(/^user:/i, "").trim();
  if (!userId) {
    return undefined;
  }
  return `feishu:${userId}`;
}

function formatWeixinAlias(target: string): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) {
    return undefined;
  }
  const userId = trimmed.replace(/^(?:user|dm):/i, "").trim();
  if (!userId.endsWith("@im.wechat")) {
    return undefined;
  }
  return `openclaw-weixin:${userId}`;
}

export function formatIdentityLinkAlias(channel: string, target: string): string | undefined {
  const normalized = normalizeMessageChannel(channel);
  if (!normalized) {
    return undefined;
  }
  if (FEISHU_CHANNEL_ALIASES.has(normalized)) {
    return formatFeishuAlias(target);
  }
  if (WEIXIN_CHANNEL_ALIASES.has(normalized)) {
    return formatWeixinAlias(target);
  }
  return undefined;
}

function mergeAliasList(existing: string[] | undefined, additions: string[]): string[] {
  const merged = [...(existing ?? [])];
  for (const alias of additions) {
    if (!merged.includes(alias)) {
      merged.push(alias);
    }
  }
  return merged;
}

export function mergeIdentityLinksFromHints(params: {
  identityLinks?: Record<string, string[]>;
  hints: SessionIdentityHints;
  canonical?: string;
}): Record<string, string[]> | null {
  const byChannel = params.hints.recipientsByChannel;
  if (!byChannel || Object.keys(byChannel).length === 0) {
    return null;
  }
  const additions: string[] = [];
  for (const [channel, target] of Object.entries(byChannel)) {
    if (typeof target !== "string") {
      continue;
    }
    const alias = formatIdentityLinkAlias(channel, target);
    if (alias) {
      additions.push(alias);
    }
  }
  if (params.hints.feishuDirectUserId?.trim()) {
    const alias = formatIdentityLinkAlias("feishu", `user:${params.hints.feishuDirectUserId.trim()}`);
    if (alias) {
      additions.push(alias);
    }
  }
  if (additions.length === 0) {
    return null;
  }

  const nextLinks: Record<string, string[]> = { ...(params.identityLinks ?? {}) };
  let changed = false;

  const senderCanonical = params.canonical?.trim();
  if (senderCanonical) {
    const previous = nextLinks[senderCanonical];
    const merged = mergeAliasList(previous, additions);
    if (!previous || merged.length !== previous.length || merged.some((v, i) => v !== previous[i])) {
      nextLinks[senderCanonical] = merged;
      changed = true;
    }
  }

  const learnedPrevious = nextLinks[LEARNED_IDENTITY_CANONICAL];
  const learnedMerged = mergeAliasList(learnedPrevious, additions);
  if (
    !learnedPrevious ||
    learnedMerged.length !== learnedPrevious.length ||
    learnedMerged.some((v, i) => v !== learnedPrevious[i])
  ) {
    nextLinks[LEARNED_IDENTITY_CANONICAL] = learnedMerged;
    changed = true;
  }

  return changed ? nextLinks : null;
}

export function resolveInboundIdentityCanonical(ctx: MsgContext): string | undefined {
  const candidates = [ctx.SenderId, ctx.From];
  for (const candidate of candidates) {
    const canonical = normalizeCanonicalSender(typeof candidate === "string" ? candidate : undefined);
    if (canonical) {
      return canonical;
    }
  }
  return undefined;
}

export async function persistIdentityHintsToIdentityLinks(params: {
  hints: SessionIdentityHints;
  canonical?: string;
}): Promise<boolean> {
  let wrote = false;
  await mutateConfigFile({
    mutate: (draft: OpenClawConfig) => {
      const merged = mergeIdentityLinksFromHints({
        identityLinks: draft.session?.identityLinks,
        hints: params.hints,
        canonical: params.canonical,
      });
      if (!merged) {
        return;
      }
      draft.session = { ...draft.session, identityLinks: merged };
      wrote = true;
    },
  });
  return wrote;
}
