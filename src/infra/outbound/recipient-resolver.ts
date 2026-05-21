import type { OpenClawConfig } from "../../config/config.js";
import { loadSessionStore, resolveSessionStoreEntry, resolveStorePath } from "../../config/sessions.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { listAgentIds } from "../../agents/agent-scope-config.js";

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

/**
 * When sender candidates are unknown (Web Chat / cron), use a uniquely determined
 * channel target from session.identityLinks (including auto-learned entries).
 */
function resolveFromIdentityLinksUniqueChannel(params: {
  adapter: RecipientAdapter;
  identityLinks?: Record<string, string[]>;
}): AutoRecipientResolution {
  const identityLinks = params.identityLinks;
  if (!identityLinks) {
    return { ok: false, reason: "identityLinks-missing" };
  }
  const targets = new Set<string>();
  let canonical = "";
  for (const [canonicalRaw, aliases] of Object.entries(identityLinks)) {
    const canonicalTarget = params.adapter.parseRecipient(canonicalRaw);
    if (canonicalTarget && params.adapter.isDirectUserTarget(canonicalTarget)) {
      targets.add(canonicalTarget);
      canonical = canonicalRaw;
    }
    if (!Array.isArray(aliases)) {
      continue;
    }
    for (const alias of aliases) {
      const parsed = params.adapter.parseRecipient(alias);
      if (parsed && params.adapter.isDirectUserTarget(parsed)) {
        targets.add(parsed);
        canonical = canonicalRaw;
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
    matchedBy: "session.identityLinks.unique",
    canonical,
  };
}

/**
 * Scan a single session store for recipient hints matching the adapter channel.
 * Optionally checks a specific sessionKey first (current session), then scans
 * all entries. Returns the set of unique parsed targets found.
 */
function collectHitsFromStore(params: {
  adapter: RecipientAdapter;
  store: Record<string, { identityHints?: { recipientsByChannel?: Record<string, string>; feishuDirectUserId?: string }; origin?: { from?: string } }>;
  sessionKey?: string;
}): Set<string> {
  const hits = new Set<string>();
  if (params.sessionKey) {
    const fromCurrent = resolveSessionStoreEntry({ store: params.store, sessionKey: params.sessionKey }).existing;
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
  }
  for (const entry of Object.values(params.store)) {
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
  return hits;
}

function hitsToResolution(
  hits: Set<string>,
  adapter: RecipientAdapter,
  matchedBy: string,
): AutoRecipientResolution {
  if (hits.size === 0) {
    return { ok: false, reason: "channel-missing" };
  }
  if (hits.size > 1) {
    return { ok: false, reason: "channel-ambiguous" };
  }
  return {
    ok: true,
    channel: adapter.channel,
    target: [...hits][0],
    matchedBy,
    canonical: matchedBy,
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
  const hits = collectHitsFromStore({
    adapter: params.adapter,
    store,
    sessionKey,
  });
  return hitsToResolution(hits, params.adapter, "session.identityHints");
}

/**
 * Cross-agent fallback: scan all configured agents' session stores when the
 * primary agent's store has no matching recipient. This allows non-main agents
 * and Web Chat sessions to discover identityHints learned via channel inbound
 * on other agents (e.g. main agent's WeChat/Feishu DM sessions).
 */
function resolveFromAllAgentSessionHints(params: {
  adapter: RecipientAdapter;
  cfg: OpenClawConfig;
  excludeAgentId?: string;
}): AutoRecipientResolution {
  const allAgentIds = listAgentIds(params.cfg);
  const hits = new Set<string>();
  for (const agentId of allAgentIds) {
    if (agentId === params.excludeAgentId) {
      continue;
    }
    const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
    let store: Record<string, { identityHints?: { recipientsByChannel?: Record<string, string>; feishuDirectUserId?: string }; origin?: { from?: string } }>;
    try {
      store = loadSessionStore(storePath);
    } catch {
      continue;
    }
    for (const hit of collectHitsFromStore({ adapter: params.adapter, store })) {
      hits.add(hit);
    }
  }
  return hitsToResolution(hits, params.adapter, "session.identityHints.crossAgent");
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
  const identityLinks = params.cfg.session?.identityLinks;
  const fromLinks = resolveFromIdentityLinks({
    adapter,
    identityLinks,
    senderCandidates: params.senderCandidates,
  });
  if (fromLinks.ok) {
    return fromLinks;
  }
  if (params.senderCandidates.length === 0) {
    const fromUniqueLinks = resolveFromIdentityLinksUniqueChannel({
      adapter,
      identityLinks,
    });
    if (fromUniqueLinks.ok) {
      return fromUniqueLinks;
    }
  }
  const fromHints = resolveFromSessionHints({
    adapter,
    cfg: params.cfg,
    agentSessionKey: params.agentSessionKey,
  });
  if (fromHints.ok) {
    return fromHints;
  }
  // Cross-agent fallback: scan other agents' session stores for identityHints
  // learned via channel inbound (e.g. WeChat/Feishu DMs on main agent).
  const excludeAgentId = params.agentSessionKey?.trim()
    ? resolveSessionAgentId({ sessionKey: params.agentSessionKey.trim(), config: params.cfg })
    : undefined;
  return resolveFromAllAgentSessionHints({
    adapter,
    cfg: params.cfg,
    excludeAgentId,
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

export type ChannelRecipientEntry = {
  channel: string;
  target: string;
  agentId: string;
};

/**
 * Collect all known channel recipients across all agents' session stores.
 * Used by the UI to populate recipient auto-complete suggestions.
 */
export function collectAllChannelRecipients(params: {
  cfg: OpenClawConfig;
  channel?: string;
}): ChannelRecipientEntry[] {
  const allAgentIds = listAgentIds(params.cfg);
  const results: ChannelRecipientEntry[] = [];
  const seen = new Set<string>();
  const adapters = params.channel
    ? RECIPIENT_ADAPTERS.filter(
        (a) => a.channel === params.channel || a.aliases.includes(params.channel!),
      )
    : RECIPIENT_ADAPTERS;
  for (const agentId of allAgentIds) {
    const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
    let store: Record<string, { identityHints?: { recipientsByChannel?: Record<string, string>; feishuDirectUserId?: string }; origin?: { from?: string } }>;
    try {
      store = loadSessionStore(storePath);
    } catch {
      continue;
    }
    for (const adapter of adapters) {
      const hits = collectHitsFromStore({ adapter, store });
      for (const target of hits) {
        const dedupeKey = `${adapter.channel}:${target}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        results.push({ channel: adapter.channel, target, agentId });
      }
    }
  }
  return results;
}
