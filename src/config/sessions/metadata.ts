import type { MsgContext } from "../../auto-reply/templating.js";
import { normalizeChatType } from "../../channels/chat-type.js";
import { resolveConversationLabel } from "../../channels/conversation-label.js";
import { getChannelDock } from "../../channels/dock.js";
import { normalizeChannelId } from "../../channels/plugins/index.js";
import { normalizeMessageChannel } from "../../utils/message-channel.js";
import { buildGroupDisplayName, resolveGroupSessionKey } from "./group.js";
import type { GroupKeyResolution, SessionEntry, SessionOrigin } from "./types.js";

const mergeOrigin = (
  existing: SessionOrigin | undefined,
  next: SessionOrigin | undefined,
): SessionOrigin | undefined => {
  if (!existing && !next) {
    return undefined;
  }
  const merged: SessionOrigin = existing ? { ...existing } : {};
  if (next?.label) {
    merged.label = next.label;
  }
  if (next?.provider) {
    merged.provider = next.provider;
  }
  if (next?.surface) {
    merged.surface = next.surface;
  }
  if (next?.chatType) {
    merged.chatType = next.chatType;
  }
  if (next?.from) {
    merged.from = next.from;
  }
  if (next?.to) {
    merged.to = next.to;
  }
  if (next?.accountId) {
    merged.accountId = next.accountId;
  }
  if (next?.threadId != null && next.threadId !== "") {
    merged.threadId = next.threadId;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
};

const FEISHU_CHANNEL_ALIASES = new Set(["feishu", "lark"]);
const WEIXIN_CHANNEL_ALIASES = new Set(["openclaw-weixin", "weixin", "wechat", "wx"]);

function normalizeFeishuUserId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replace(/^(?:feishu|lark):/i, "").trim();
  if (!normalized) {
    return undefined;
  }
  const prefixed = normalized.replace(/^(?:user|dm):/i, "").trim();
  if (!prefixed) {
    return undefined;
  }
  const lower = prefixed.toLowerCase();
  if (lower.startsWith("ou_") || lower.startsWith("on_")) {
    return prefixed;
  }
  return undefined;
}

function normalizeWeixinUserId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replace(/^(?:openclaw-weixin|weixin|wechat|wx):/i, "").trim();
  if (!normalized) {
    return undefined;
  }
  const unwrapped = normalized.replace(/^(?:user|dm):/i, "").trim();
  if (!unwrapped) {
    return undefined;
  }
  return unwrapped.endsWith("@im.wechat") ? unwrapped : `${unwrapped}@im.wechat`;
}

function deriveIdentityHintsPatch(params: {
  ctx: MsgContext;
  existing?: SessionEntry;
}): SessionEntry["identityHints"] | undefined {
  const provider = normalizeMessageChannel(
    (typeof params.ctx.OriginatingChannel === "string" && params.ctx.OriginatingChannel) ||
      params.ctx.Surface ||
      params.ctx.Provider,
  );
  if (!provider) {
    return undefined;
  }
  const chatType = normalizeChatType(params.ctx.ChatType);
  if (chatType && chatType !== "direct") {
    return undefined;
  }
  const candidates = [
    params.ctx.SenderId,
    params.ctx.From,
    typeof params.ctx.OriginatingTo === "string" ? params.ctx.OriginatingTo : undefined,
    params.ctx.To,
  ];
  const learnedForFeishu = FEISHU_CHANNEL_ALIASES.has(provider);
  const learnedForWeixin = WEIXIN_CHANNEL_ALIASES.has(provider);
  if (!learnedForFeishu && !learnedForWeixin) {
    return undefined;
  }
  const existingHints = params.existing?.identityHints;
  const existingByChannel = existingHints?.recipientsByChannel ?? {};
  const nextByChannel = { ...existingByChannel };
  let hasAnyChange = false;

  if (learnedForFeishu) {
    let learnedUserId: string | undefined;
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const parsed = normalizeFeishuUserId(candidate);
      if (parsed) {
        learnedUserId = parsed;
        break;
      }
    }
    if (learnedUserId) {
      const nextTarget = `user:${learnedUserId}`;
      const previousTarget =
        existingByChannel.feishu ??
        (existingHints?.feishuDirectUserId ? `user:${existingHints.feishuDirectUserId}` : undefined);
      if (previousTarget !== nextTarget) {
        nextByChannel.feishu = nextTarget;
        hasAnyChange = true;
      }
    }
  }

  if (learnedForWeixin) {
    let learnedUserId: string | undefined;
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const parsed = normalizeWeixinUserId(candidate);
      if (parsed) {
        learnedUserId = parsed;
        break;
      }
    }
    if (learnedUserId) {
      const previousTarget = existingByChannel["openclaw-weixin"];
      if (previousTarget !== learnedUserId) {
        nextByChannel["openclaw-weixin"] = learnedUserId;
        hasAnyChange = true;
      }
    }
  }

  if (!hasAnyChange) {
    return existingHints;
  }
  return {
    ...(existingHints ?? {}),
    recipientsByChannel: nextByChannel,
    feishuDirectUserId:
      learnedForFeishu && typeof nextByChannel.feishu === "string"
        ? nextByChannel.feishu.replace(/^user:/i, "")
        : existingHints?.feishuDirectUserId,
    updatedAt: Date.now(),
  };
}

export function deriveSessionOrigin(ctx: MsgContext): SessionOrigin | undefined {
  const label = resolveConversationLabel(ctx)?.trim();
  const providerRaw =
    (typeof ctx.OriginatingChannel === "string" && ctx.OriginatingChannel) ||
    ctx.Surface ||
    ctx.Provider;
  const provider = normalizeMessageChannel(providerRaw);
  const surface = ctx.Surface?.trim().toLowerCase();
  const chatType = normalizeChatType(ctx.ChatType) ?? undefined;
  const from = ctx.From?.trim();
  const to =
    (typeof ctx.OriginatingTo === "string" ? ctx.OriginatingTo : ctx.To)?.trim() ?? undefined;
  const accountId = ctx.AccountId?.trim();
  const threadId = ctx.MessageThreadId ?? undefined;

  const origin: SessionOrigin = {};
  if (label) {
    origin.label = label;
  }
  if (provider) {
    origin.provider = provider;
  }
  if (surface) {
    origin.surface = surface;
  }
  if (chatType) {
    origin.chatType = chatType;
  }
  if (from) {
    origin.from = from;
  }
  if (to) {
    origin.to = to;
  }
  if (accountId) {
    origin.accountId = accountId;
  }
  if (threadId != null && threadId !== "") {
    origin.threadId = threadId;
  }

  return Object.keys(origin).length > 0 ? origin : undefined;
}

export function snapshotSessionOrigin(entry?: SessionEntry): SessionOrigin | undefined {
  if (!entry?.origin) {
    return undefined;
  }
  return { ...entry.origin };
}

export function deriveGroupSessionPatch(params: {
  ctx: MsgContext;
  sessionKey: string;
  existing?: SessionEntry;
  groupResolution?: GroupKeyResolution | null;
}): Partial<SessionEntry> | null {
  const resolution = params.groupResolution ?? resolveGroupSessionKey(params.ctx);
  if (!resolution?.channel) {
    return null;
  }

  const channel = resolution.channel;
  const subject = params.ctx.GroupSubject?.trim();
  const space = params.ctx.GroupSpace?.trim();
  const explicitChannel = params.ctx.GroupChannel?.trim();
  const normalizedChannel = normalizeChannelId(channel);
  const isChannelProvider = Boolean(
    normalizedChannel &&
    getChannelDock(normalizedChannel)?.capabilities.chatTypes.includes("channel"),
  );
  const nextGroupChannel =
    explicitChannel ??
    ((resolution.chatType === "channel" || isChannelProvider) && subject && subject.startsWith("#")
      ? subject
      : undefined);
  const nextSubject = nextGroupChannel ? undefined : subject;

  const patch: Partial<SessionEntry> = {
    chatType: resolution.chatType ?? "group",
    channel,
    groupId: resolution.id,
  };
  if (nextSubject) {
    patch.subject = nextSubject;
  }
  if (nextGroupChannel) {
    patch.groupChannel = nextGroupChannel;
  }
  if (space) {
    patch.space = space;
  }

  const displayName = buildGroupDisplayName({
    provider: channel,
    subject: nextSubject ?? params.existing?.subject,
    groupChannel: nextGroupChannel ?? params.existing?.groupChannel,
    space: space ?? params.existing?.space,
    id: resolution.id,
    key: params.sessionKey,
  });
  if (displayName) {
    patch.displayName = displayName;
  }

  return patch;
}

export function deriveSessionMetaPatch(params: {
  ctx: MsgContext;
  sessionKey: string;
  existing?: SessionEntry;
  groupResolution?: GroupKeyResolution | null;
}): Partial<SessionEntry> | null {
  const groupPatch = deriveGroupSessionPatch(params);
  const origin = deriveSessionOrigin(params.ctx);
  const identityHints = deriveIdentityHintsPatch({
    ctx: params.ctx,
    existing: params.existing,
  });
  if (!groupPatch && !origin && !identityHints) {
    return null;
  }

  const patch: Partial<SessionEntry> = groupPatch ? { ...groupPatch } : {};
  const mergedOrigin = mergeOrigin(params.existing?.origin, origin);
  if (mergedOrigin) {
    patch.origin = mergedOrigin;
  }
  if (identityHints) {
    patch.identityHints = identityHints;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
