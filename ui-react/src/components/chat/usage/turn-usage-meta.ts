/** Per assistant-turn usage aggregated for tool group header (aligned with ui grouped-render). */

export type TurnUsageMeta = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  model: string | null;
  contextPercent: number | null;
  /** Largest single-call prompt footprint (input + cache); used when aggregating turns. */
  maxPromptTokens?: number;
};

type UsageRecord = Record<string, number | undefined>;

function readUsageNumbers(usage: UsageRecord): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  maxPromptTokens: number;
} {
  const input = usage.input ?? usage.inputTokens ?? 0;
  const output = usage.output ?? usage.outputTokens ?? 0;
  const cacheRead = usage.cacheRead ?? usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cacheWrite ?? usage.cache_creation_input_tokens ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    maxPromptTokens: input + cacheRead + cacheWrite,
  };
}

export function mergeTurnUsageMeta(
  current: TurnUsageMeta | undefined,
  raw: {
    usage?: unknown;
    cost?: unknown;
    model?: unknown;
  },
  contextWindow: number | null,
): TurnUsageMeta | null {
  const m = raw as Record<string, unknown>;
  const usage =
    m.usage && typeof m.usage === "object"
      ? (m.usage as UsageRecord)
      : undefined;
  const costObj =
    m.cost && typeof m.cost === "object" ? (m.cost as Record<string, number>) : undefined;
  const model = typeof m.model === "string" && m.model !== "gateway-injected" ? m.model : null;

  let input = current?.input ?? 0;
  let output = current?.output ?? 0;
  let cacheRead = current?.cacheRead ?? 0;
  let cacheWrite = current?.cacheWrite ?? 0;
  let cost = current?.cost ?? 0;
  let resolvedModel = current?.model ?? null;
  let hasUsage = Boolean(
    current &&
      (current.input || current.output || current.cacheRead || current.cacheWrite),
  );
  let maxPromptTokens = current?.maxPromptTokens ?? 0;

  if (usage) {
    hasUsage = true;
    const nums = readUsageNumbers(usage);
    input += nums.input;
    output += nums.output;
    cacheRead += nums.cacheRead;
    cacheWrite += nums.cacheWrite;
    maxPromptTokens = Math.max(maxPromptTokens, nums.maxPromptTokens);
  }

  if (costObj?.total) {
    cost += costObj.total;
  }
  if (model) {
    resolvedModel = model;
  }

  if (!hasUsage && !resolvedModel) {
    return null;
  }

  const contextPercent =
    contextWindow && maxPromptTokens > 0
      ? Math.min(Math.round((maxPromptTokens / contextWindow) * 100), 100)
      : current?.contextPercent ?? null;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cost,
    model: resolvedModel,
    contextPercent,
    maxPromptTokens: maxPromptTokens > 0 ? maxPromptTokens : undefined,
  };
}

/** Compact token count formatter (e.g. 128000 → "128k"). */
export function formatTurnTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export function shortenModelName(model: string): string {
  return model.includes("/") ? (model.split("/").pop() ?? model) : model;
}

export type TurnUsageHeaderLine = {
  primary: string;
  title: string;
};

export function formatTurnUsageHeaderLine(meta: TurnUsageMeta): TurnUsageHeaderLine {
  const parts: string[] = [];
  if (meta.input > 0) {
    parts.push(`↑${formatTurnTokens(meta.input)}`);
  }
  if (meta.output > 0) {
    parts.push(`↓${formatTurnTokens(meta.output)}`);
  }
  if (meta.contextPercent !== null) {
    parts.push(`${meta.contextPercent}% ctx`);
  }
  if (meta.cost > 0) {
    parts.push(`$${meta.cost.toFixed(4)}`);
  }

  const detailParts: string[] = [];
  if (meta.cacheRead > 0) {
    detailParts.push(`cache read ${formatTurnTokens(meta.cacheRead)}`);
  }
  if (meta.cacheWrite > 0) {
    detailParts.push(`cache write ${formatTurnTokens(meta.cacheWrite)}`);
  }
  if (meta.model) {
    detailParts.push(shortenModelName(meta.model));
  }

  const primary = parts.length > 0 ? parts.join(" · ") : "";
  const title =
    detailParts.length > 0 ? `${primary} (${detailParts.join(", ")})` : primary;

  return { primary, title };
}
