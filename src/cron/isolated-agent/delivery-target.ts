import type { ChannelId } from "../../channels/plugins/types.js";
import type { OpenClawConfig } from "../../config/config.js";
import {
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveStorePath,
} from "../../config/sessions.js";
import { resolveMessageChannelSelection } from "../../infra/outbound/channel-selection.js";
import { resolveAutoRecipient } from "../../infra/outbound/recipient-resolver.js";
import { maybeResolveIdLikeTarget } from "../../infra/outbound/target-resolver.js";
import type { OutboundChannel } from "../../infra/outbound/targets.js";
import {
  resolveOutboundTarget,
  resolveSessionDeliveryTarget,
} from "../../infra/outbound/targets.js";
import { readChannelAllowFromStoreSync } from "../../pairing/pairing-store.js";
import { buildChannelAccountBindings } from "../../routing/bindings.js";
import { normalizeAccountId, normalizeAgentId } from "../../routing/session-key.js";
import { resolveWhatsAppAccount } from "../../web/accounts.js";
import { normalizeWhatsAppTarget } from "../../whatsapp/normalize.js";

export type DeliveryTargetResolution =
  | {
      ok: true;
      channel: Exclude<OutboundChannel, "none">;
      to: string;
      accountId?: string;
      threadId?: string | number;
      mode: "explicit" | "implicit";
    }
  | {
      ok: false;
      channel?: Exclude<OutboundChannel, "none">;
      to?: string;
      accountId?: string;
      threadId?: string | number;
      mode: "explicit" | "implicit";
      error: Error;
    };

const CHANNEL_ALIAS_CANDIDATES: Record<string, string[]> = {
  feishu: ["feishu", "lark"],
  lark: ["lark", "feishu"],
  "openclaw-weixin": ["openclaw-weixin", "weixin", "wechat", "wx"],
  weixin: ["weixin", "openclaw-weixin", "wechat", "wx"],
  wechat: ["wechat", "openclaw-weixin", "weixin", "wx"],
  wx: ["wx", "openclaw-weixin", "weixin", "wechat"],
};

function isLikelyWeixinTarget(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.endsWith("@im.wechat") || /^wxid_[a-z0-9_-]+$/i.test(trimmed);
}

function isLikelyFeishuTarget(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return /^user:/i.test(trimmed) || /^chat:/i.test(trimmed) || /^o[un]_/i.test(trimmed);
}

export async function resolveDeliveryTarget(
  cfg: OpenClawConfig,
  agentId: string,
  jobPayload: {
    channel?: "last" | ChannelId;
    to?: string;
    /** Explicit accountId from job.delivery — overrides session-derived and binding-derived values. */
    accountId?: string;
    sessionKey?: string;
  },
): Promise<DeliveryTargetResolution> {
  const requestedChannel = typeof jobPayload.channel === "string" ? jobPayload.channel : "last";
  const requestedChannelNormalized = requestedChannel.trim().toLowerCase();
  const hasExplicitChannel = requestedChannelNormalized !== "last";
  const explicitTo = typeof jobPayload.to === "string" ? jobPayload.to : undefined;
  const allowMismatchedLastTo = requestedChannel === "last";

  const sessionCfg = cfg.session;
  const mainSessionKey = resolveAgentMainSessionKey({ cfg, agentId });
  const storePath = resolveStorePath(sessionCfg?.store, { agentId });
  const store = loadSessionStore(storePath);

  // Look up thread-specific session first (e.g. agent:main:main:thread:1234),
  // then fall back to the main session entry.
  const threadSessionKey = jobPayload.sessionKey?.trim();
  const threadEntry = threadSessionKey ? store[threadSessionKey] : undefined;
  const main = threadEntry ?? store[mainSessionKey];

  let preliminary = resolveSessionDeliveryTarget({
    entry: main,
    requestedChannel,
    explicitTo,
    allowMismatchedLastTo,
  });

  if (!preliminary.channel && hasExplicitChannel) {
    const candidates = CHANNEL_ALIAS_CANDIDATES[requestedChannelNormalized] ?? [requestedChannel];
    for (const candidate of candidates) {
      const retried = resolveSessionDeliveryTarget({
        entry: main,
        requestedChannel: candidate as ChannelId,
        explicitTo,
        allowMismatchedLastTo: false,
      });
      if (retried.channel) {
        preliminary = retried;
        break;
      }
    }
  }

  let fallbackChannel: Exclude<OutboundChannel, "none"> | undefined;
  let channelResolutionError: Error | undefined;
  if (!preliminary.channel) {
    if (hasExplicitChannel) {
      channelResolutionError = new Error(
        `Unsupported or unavailable delivery channel "${requestedChannel}". Check channel id/alias and channel status.`,
      );
    } else if (preliminary.lastChannel) {
      fallbackChannel = preliminary.lastChannel;
    } else {
      try {
        const selection = await resolveMessageChannelSelection({ cfg });
        fallbackChannel = selection.channel;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        channelResolutionError = new Error(
          `${detail} Set delivery.channel explicitly or use a main session with a previous channel.`,
        );
      }
    }
  }

  const resolved = fallbackChannel
    ? resolveSessionDeliveryTarget({
        entry: main,
        requestedChannel,
        explicitTo,
        fallbackChannel,
        allowMismatchedLastTo,
        mode: preliminary.mode,
      })
    : preliminary;

  const channel = resolved.channel ?? fallbackChannel;
  const mode = resolved.mode as "explicit" | "implicit";
  let toCandidate = resolved.to;

  // Guard against channel/target mismatches (e.g. Feishu channel carrying a
  // Weixin recipient id from model extraction). Drop the mismatched explicit
  // target and let channel-specific auto-recipient resolution recover it.
  if (channel === "feishu" && toCandidate && isLikelyWeixinTarget(toCandidate)) {
    toCandidate = undefined;
  }
  if (channel === "openclaw-weixin" && toCandidate && isLikelyFeishuTarget(toCandidate)) {
    toCandidate = undefined;
  }

  // For Feishu/Weixin cron announce runs, allow automatic recipient recovery
  // from session identity hints when delivery.to is omitted in job config.
  if (!toCandidate && channel) {
    const autoRecipient = resolveAutoRecipient({
      channel,
      cfg,
      agentSessionKey: threadSessionKey ?? mainSessionKey,
      senderCandidates: [],
    });
    if (autoRecipient.ok && autoRecipient.channel === channel) {
      toCandidate = autoRecipient.target;
    }
  }

  // Prefer an explicit accountId from the job's delivery config (set via
  // --account on cron add/edit). Fall back to the session's lastAccountId,
  // then to the agent's bound account from bindings config.
  const explicitAccountId =
    typeof jobPayload.accountId === "string" && jobPayload.accountId.trim()
      ? jobPayload.accountId.trim()
      : undefined;
  let accountId = explicitAccountId ?? resolved.accountId;
  if (!accountId && channel) {
    const bindings = buildChannelAccountBindings(cfg);
    const byAgent = bindings.get(channel);
    const boundAccounts = byAgent?.get(normalizeAgentId(agentId));
    if (boundAccounts && boundAccounts.length > 0) {
      accountId = boundAccounts[0];
    }
  }

  // job.delivery.accountId takes highest precedence — explicitly set by the job author.
  if (jobPayload.accountId) {
    accountId = jobPayload.accountId;
  }

  // Carry threadId when it was explicitly set (from :topic: parsing or config)
  // or when delivering to the same recipient as the session's last conversation.
  // Session-derived threadIds are dropped when the target differs to prevent
  // stale thread IDs from leaking to a different chat.
  const threadId =
    resolved.threadId &&
    (resolved.threadIdExplicit || (resolved.to && resolved.to === resolved.lastTo))
      ? resolved.threadId
      : undefined;

  if (!channel) {
    return {
      ok: false,
      channel: undefined,
      to: undefined,
      accountId,
      threadId,
      mode,
      error:
        channelResolutionError ??
        new Error("Channel is required when delivery.channel=last has no previous channel."),
    };
  }

  let allowFromOverride: string[] | undefined;
  if (channel === "whatsapp") {
    const resolvedAccountId = normalizeAccountId(accountId);
    const configuredAllowFromRaw =
      resolveWhatsAppAccount({ cfg, accountId: resolvedAccountId }).allowFrom ?? [];
    const configuredAllowFrom = configuredAllowFromRaw
      .map((entry) => String(entry).trim())
      .filter((entry) => entry && entry !== "*")
      .map((entry) => normalizeWhatsAppTarget(entry))
      .filter((entry): entry is string => Boolean(entry));
    const storeAllowFrom = readChannelAllowFromStoreSync("whatsapp", process.env, resolvedAccountId)
      .map((entry) => normalizeWhatsAppTarget(entry))
      .filter((entry): entry is string => Boolean(entry));
    allowFromOverride = [...new Set([...configuredAllowFrom, ...storeAllowFrom])];

    if (toCandidate && mode === "implicit" && allowFromOverride.length > 0) {
      const normalizedCurrentTarget = normalizeWhatsAppTarget(toCandidate);
      if (!normalizedCurrentTarget || !allowFromOverride.includes(normalizedCurrentTarget)) {
        toCandidate = allowFromOverride[0];
      }
    }
  }

  const docked = resolveOutboundTarget({
    channel,
    to: toCandidate,
    cfg,
    accountId,
    mode,
    allowFrom: allowFromOverride,
  });
  if (!docked.ok) {
    return {
      ok: false,
      channel,
      to: undefined,
      accountId,
      threadId,
      mode,
      error: docked.error,
    };
  }
  const idLikeTarget = await maybeResolveIdLikeTarget({
    cfg,
    channel,
    input: docked.to,
    accountId,
  });
  return {
    ok: true,
    channel,
    to: idLikeTarget?.to ?? docked.to,
    accountId,
    threadId,
    mode,
  };
}
