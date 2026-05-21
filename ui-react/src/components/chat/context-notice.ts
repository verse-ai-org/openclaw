import type { SessionEntry } from "@/hooks/session-manager/types";

const CONTEXT_NOTICE_RATIO = 0.85;
const CONTEXT_COMPACT_RATIO = 0.9;

export type ContextNoticeViewModel = {
  pct: number;
  detail: string;
  warning: boolean;
  compactRecommended: boolean;
};

/** Format token count compactly (e.g. 128000 -> "128k"). */
export function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export function getContextNoticeViewModel(
  session: SessionEntry | undefined,
  defaultContextTokens: number | null,
): ContextNoticeViewModel | null {
  if (session?.totalTokensFresh === false) {
    return null;
  }
  const used = session?.totalTokens;
  const limit = session?.contextTokens ?? defaultContextTokens ?? 0;
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || !limit) {
    return null;
  }
  const ratio = used / limit;
  const pct = Math.min(Math.round(ratio * 100), 100);
  const warning = ratio >= CONTEXT_NOTICE_RATIO;
  return {
    pct,
    detail: `${formatTokensCompact(used)} / ${formatTokensCompact(limit)}`,
    warning,
    compactRecommended: ratio >= CONTEXT_COMPACT_RATIO,
  };
}

export function contextNoticeTitle(model: ContextNoticeViewModel): string {
  return `Session context usage: ${model.detail} (${model.pct}%)`;
}
