import type { OpenClawConfig } from "../../config/config.js";
import { loadSessionStore, resolveSessionStoreEntry, resolveStorePath } from "../../config/sessions.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";

export type AutoRecipientResolution =
  | { ok: true; channel: string; target: string; matchedBy: string; canonical: string }
  | {
      ok: false;
      reason:
        | "identityLinks-missing"
        | "sender-missing"
        | "sender-ambiguous"
        | "channel-ambiguous"
        | "channel-missing";
    };

type RecipientAdapter = {
  channel: string;
  aliases: string[];
  parseRecipient(identity: string): string | null;
  isDirectUserTarget(target: string): boolean;
};

const FEISHU_ADAPTER: RecipientAdapter = {
  channel: "feishu",
  aliases: ["feishu", "lark"],
  parseRecipient(identity: string): string | null {
    let value = identity.trim();
    if (!value) {
      return null;
    }
    for (;;) {
      const next = value.replace(/^(?:feishu|lark):/i, "").trim();
      if (next === value) {
        break;
      }
      value = next;
    }
    if (/^(?:user|dm):/i.test(value)) {
      value = value.replace(/^(?:user|dm):/i, "").trim();
      return value ? `user:${value}` : null;
    }
    if (/^(?:chat|group):/i.test(value)) {
      value = value.replace(/^(?:chat|group):/i, "").trim();
      return value ? `chat:${value}` : null;
    }
    const lower = value.toLowerCase();
    if (lower.startsWith("ou_") || lower.startsWith("on_")) {
      return `user:${value}`;
    }
    if (lower.startsWith("oc_")) {
      return `chat:${value}`;
    }
    return null;
  },
  isDirectUserTarget(target: string): boolean {
    return /^user:/i.test(target.trim());
  },
};

const WEIXIN_ADAPTER: RecipientAdapter = {
  channel: "openclaw-weixin",
  aliases: ["openclaw-weixin", "weixin", "wechat", "微信", "wx"],
  parseRecipient(identity: string): string | null {
    let value = identity.trim();
    if (!value) {
      return null;
    }
    for (;;) {
      const next = value.replace(/^(?:openclaw-weixin|weixin|wechat|wx):/i, "").trim();
      if (next === value) {
        break;
      }
      value = next;
    }
    value = value.replace(/^(?:user|dm):/i, "").trim();
    if (!value) {
      return null;
    }
    if (value.endsWith("@im.wechat")) {
      return value;
    }
    // Avoid turning arbitrary canonical names into recipient ids.
    if (!/^wxid_[a-z0-9_-]+$/i.test(value)) {
      return null;
    }
    return `${value}@im.wechat`;
  },
  isDirectUserTarget(target: string): boolean {
    return /@im\.wechat$/i.test(target.trim());
  },
};

const RECIPIENT_ADAPTERS: RecipientAdapter[] = [FEISHU_ADAPTER, WEIXIN_ADAPTER];

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function resolveFromIdentityLinks(params: {
  adapter: RecipientAdapter;
  identityLinks?: Record<string, string[]>;
  senderCandidates: string[];
}): AutoRecipientResolution {
  const identityLinks = params.identityLinks;
  if (!identityLinks) {
    return { ok: false, reason: "identityLinks-missing" };
  }
  const normalizedCandidates = new Set(
    params.senderCandidates.map((item) => normalizeIdentity(item)).filter(Boolean),
  );
  if (normalizedCandidates.size === 0) {
    return { ok: false, reason: "sender-missing" };
  }
  const canonicalMatches: Array<{ canonical: string; matchedBy: string }> = [];
  for (const [canonicalRaw, aliases] of Object.entries(identityLinks)) {
    const canonical = canonicalRaw.trim();
    if (!canonical) {
      continue;
    }
    const normalizedCanonical = normalizeIdentity(canonical);
    if (normalizedCanonical && normalizedCandidates.has(normalizedCanonical)) {
      canonicalMatches.push({ canonical, matchedBy: canonical });
      continue;
    }
    if (!Array.isArray(aliases)) {
      continue;
    }
    for (const alias of aliases) {
      const normalizedAlias = normalizeIdentity(alias);
      if (normalizedAlias && normalizedCandidates.has(normalizedAlias)) {
        canonicalMatches.push({ canonical, matchedBy: alias });
        break;
      }
    }
  }
  if (canonicalMatches.length !== 1) {
    return {
      ok: false,
      reason: canonicalMatches.length === 0 ? "sender-missing" : "sender-ambiguous",
    };
  }
  const match = canonicalMatches[0];
  const aliases = identityLinks[match.canonical];
  const targets = new Set<string>();
  const canonicalTarget = params.adapter.parseRecipient(match.canonical);
  if (canonicalTarget && params.adapter.isDirectUserTarget(canonicalTarget)) {
    targets.add(canonicalTarget);
  }
  if (Array.isArray(aliases)) {
    for (const alias of aliases) {
      const parsed = params.adapter.parseRecipient(alias);
      if (parsed && params.adapter.isDirectUserTarget(parsed)) {
        targets.add(parsed);
      }
    }
  }
  if (targets.size === 0) {
    return { ok: false, reason: "channel-missing" };
  }
  if (targets.size !== 1) {
    return { ok: false, reason: "channel-ambiguous" };
  }
  return {
    ok: true,
    channel: params.adapter.channel,
    target: [...targets][0],
    matchedBy: match.matchedBy,
    canonical: match.canonical,
  };
}

function resolveFromSessionHints(params: {
  adapter: RecipientAdapter;
  cfg: OpenClawConfig;
  agentSessionKey?: string;
}): AutoRecipientResolution {
  const sessionKey = params.agentSessionKey?.trim();
  if (!sessionKey) {
    return { ok: false, reason: "sender-missing" };
  }
  const agentId = resolveSessionAgentId({
    sessionKey,
    config: params.cfg,
  });
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const hits = new Set<string>();
  const fromCurrent = resolveSessionStoreEntry({ store, sessionKey }).existing;
  const aliasKey = params.adapter.aliases.find(
    (alias) => fromCurrent?.identityHints?.recipientsByChannel?.[alias],
  );
  const currentHint =
    (aliasKey ? fromCurrent?.identityHints?.recipientsByChannel?.[aliasKey]?.trim() : undefined) ??
    (params.adapter.channel === "feishu" && fromCurrent?.identityHints?.feishuDirectUserId?.trim()
      ? `user:${fromCurrent.identityHints.feishuDirectUserId.trim()}`
      : undefined);
  if (currentHint) {
    const parsed = params.adapter.parseRecipient(currentHint);
    if (parsed && params.adapter.isDirectUserTarget(parsed)) {
      hits.add(parsed);
    }
  }
  for (const entry of Object.values(store)) {
    const entryAlias = params.adapter.aliases.find(
      (alias) => entry.identityHints?.recipientsByChannel?.[alias],
    );
    const hintedRaw =
      (entryAlias ? entry.identityHints?.recipientsByChannel?.[entryAlias]?.trim() : undefined) ??
      (params.adapter.channel === "feishu" && entry.identityHints?.feishuDirectUserId?.trim()
        ? `user:${entry.identityHints.feishuDirectUserId.trim()}`
        : undefined);
    const hinted = hintedRaw ? params.adapter.parseRecipient(hintedRaw) : null;
    if (hinted && params.adapter.isDirectUserTarget(hinted)) {
      hits.add(hinted);
      continue;
    }
    const fromOrigin = entry.origin?.from?.trim();
    const parsed = fromOrigin ? params.adapter.parseRecipient(fromOrigin) : null;
    if (parsed && params.adapter.isDirectUserTarget(parsed)) {
      hits.add(parsed);
    }
  }
  if (hits.size === 0) {
    return { ok: false, reason: "channel-missing" };
  }
  if (hits.size > 1) {
    return { ok: false, reason: "channel-ambiguous" };
  }
  const target = [...hits][0];
  return {
    ok: true,
    channel: params.adapter.channel,
    target,
    matchedBy: "session.identityHints",
    canonical: "session.identityHints",
  };
}

export function resolveAutoRecipient(params: {
  channel: string;
  cfg: OpenClawConfig;
  agentSessionKey?: string;
  senderCandidates: string[];
}): AutoRecipientResolution {
  const requestedChannel = params.channel.trim().toLowerCase();
  const adapter = RECIPIENT_ADAPTERS.find(
    (candidate) => candidate.channel === requestedChannel || candidate.aliases.includes(requestedChannel),
  );
  if (!adapter) {
    return { ok: false, reason: "channel-missing" };
  }
  const fromLinks = resolveFromIdentityLinks({
    adapter,
    identityLinks: params.cfg.session?.identityLinks,
    senderCandidates: params.senderCandidates,
  });
  if (fromLinks.ok) {
    return fromLinks;
  }
  return resolveFromSessionHints({
    adapter,
    cfg: params.cfg,
    agentSessionKey: params.agentSessionKey,
  });
}

export function resolveAutoFeishuRecipient(params: {
  cfg: OpenClawConfig;
  agentSessionKey?: string;
  senderCandidates: string[];
}): AutoRecipientResolution {
  return resolveAutoRecipient({
    channel: "feishu",
    cfg: params.cfg,
    agentSessionKey: params.agentSessionKey,
    senderCandidates: params.senderCandidates,
  });
}
