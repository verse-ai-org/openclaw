import fs from "node:fs/promises";
import path from "node:path";

export type ChatInteractionStatus =
  | "awaiting_user"
  | "submitted"
  | "consumed"
  | "cancelled"
  | "expired"
  | "failed";

export type ChatInteractionRecord = {
  id: string;
  sessionKey: string;
  runId?: string;
  kind: string;
  definition: unknown;
  status: ChatInteractionStatus;
  createdAt: number;
  updatedAt: number;
  expiresAtMs?: number;
  submittedAt?: number;
  submittedBy?: string;
  submittedPayload?: ChatInteractionSubmittedPayload;
  resumeRunId?: string;
  lastResumeAtMs?: number;
  resumeAttempts?: number;
};

export type ChatInteractionSummaryEntry = {
  question: string;
  answer: string;
};

export type ChatInteractionSubmittedPayload = {
  version: 1;
  kind: string;
  mode?: string;
  data: Record<string, unknown>;
  summary?: ChatInteractionSummaryEntry[];
  displayText?: string;
};

type InteractionStoreFile = {
  version: 1;
  interactions: ChatInteractionRecord[];
};

const INTERACTION_STORE_FILE = "chat-interactions.json";

function normalizeSessionKey(value: string): string {
  return value.trim();
}

function normalizeStore(data: unknown): InteractionStoreFile {
  if (!data || typeof data !== "object") {
    return { version: 1, interactions: [] };
  }
  const parsed = data as { interactions?: unknown };
  const interactions = Array.isArray(parsed.interactions)
    ? parsed.interactions.filter(
        (entry): entry is ChatInteractionRecord =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as { id?: unknown }).id === "string" &&
          typeof (entry as { sessionKey?: unknown }).sessionKey === "string" &&
          typeof (entry as { kind?: unknown }).kind === "string" &&
          typeof (entry as { status?: unknown }).status === "string" &&
          typeof (entry as { createdAt?: unknown }).createdAt === "number" &&
          typeof (entry as { updatedAt?: unknown }).updatedAt === "number",
      )
    : [];
  return {
    version: 1,
    interactions,
  };
}

function storePathFromSessionStorePath(sessionStorePath: string): string {
  return path.join(path.dirname(sessionStorePath), INTERACTION_STORE_FILE);
}

async function readStore(sessionStorePath: string): Promise<InteractionStoreFile> {
  const filePath = storePathFromSessionStorePath(sessionStorePath);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return { version: 1, interactions: [] };
  }
}

async function writeStore(sessionStorePath: string, store: InteractionStoreFile): Promise<void> {
  const filePath = storePathFromSessionStorePath(sessionStorePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const next = JSON.stringify(store, null, 2);
  await fs.writeFile(filePath, next, "utf-8");
}

export async function createInteraction(params: {
  sessionStorePath: string;
  interaction: ChatInteractionRecord;
}): Promise<ChatInteractionRecord> {
  const store = await readStore(params.sessionStorePath);
  const interactions = store.interactions.filter(
    (item) => item.id !== params.interaction.id,
  );
  interactions.push({
    ...params.interaction,
    sessionKey: normalizeSessionKey(params.interaction.sessionKey),
  });
  await writeStore(params.sessionStorePath, { version: 1, interactions });
  return params.interaction;
}

export async function listInteractions(params: {
  sessionStorePath: string;
  sessionKey: string;
  statuses?: Set<ChatInteractionStatus>;
}): Promise<ChatInteractionRecord[]> {
  const store = await readStore(params.sessionStorePath);
  const sessionKey = normalizeSessionKey(params.sessionKey);
  return store.interactions
    .filter(
      (item) =>
        item.sessionKey === sessionKey &&
        (!params.statuses || params.statuses.has(item.status)),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function submitInteraction(params: {
  sessionStorePath: string;
  sessionKey: string;
  interactionId: string;
  payload: ChatInteractionSubmittedPayload;
  submittedBy?: string;
}): Promise<
  | { ok: true; interaction: ChatInteractionRecord }
  | { ok: false; reason: "not_found" | "invalid_state" }
> {
  const sessionKey = normalizeSessionKey(params.sessionKey);
  const store = await readStore(params.sessionStorePath);
  const idx = store.interactions.findIndex(
    (item) =>
      item.id === params.interactionId && item.sessionKey === sessionKey,
  );
  if (idx < 0) {
    return { ok: false, reason: "not_found" };
  }
  const target = store.interactions[idx]!;
  if (target.status !== "awaiting_user") {
    return { ok: false, reason: "invalid_state" };
  }
  const now = Date.now();
  const next: ChatInteractionRecord = {
    ...target,
    status: "submitted",
    submittedPayload: params.payload,
    submittedAt: now,
    submittedBy: params.submittedBy,
    updatedAt: now,
  };
  store.interactions[idx] = next;
  await writeStore(params.sessionStorePath, store);
  return { ok: true, interaction: next };
}

export async function consumeInteraction(params: {
  sessionStorePath: string;
  sessionKey: string;
  interactionId: string;
}): Promise<
  | { ok: true; interaction: ChatInteractionRecord }
  | { ok: false; reason: "not_found" | "invalid_state" }
> {
  const sessionKey = normalizeSessionKey(params.sessionKey);
  const store = await readStore(params.sessionStorePath);
  const idx = store.interactions.findIndex(
    (item) =>
      item.id === params.interactionId && item.sessionKey === sessionKey,
  );
  if (idx < 0) {
    return { ok: false, reason: "not_found" };
  }
  const target = store.interactions[idx]!;
  if (target.status !== "submitted") {
    return { ok: false, reason: "invalid_state" };
  }
  const next: ChatInteractionRecord = {
    ...target,
    status: "consumed",
    updatedAt: Date.now(),
  };
  store.interactions[idx] = next;
  await writeStore(params.sessionStorePath, store);
  return { ok: true, interaction: next };
}

export async function markInteractionResumeStarted(params: {
  sessionStorePath: string;
  sessionKey: string;
  interactionId: string;
  resumeRunId: string;
}): Promise<
  | { ok: true; interaction: ChatInteractionRecord }
  | { ok: false; reason: "not_found" | "invalid_state" }
> {
  const sessionKey = normalizeSessionKey(params.sessionKey);
  const store = await readStore(params.sessionStorePath);
  const idx = store.interactions.findIndex(
    (item) => item.id === params.interactionId && item.sessionKey === sessionKey,
  );
  if (idx < 0) {
    return { ok: false, reason: "not_found" };
  }
  const target = store.interactions[idx]!;
  if (target.status !== "submitted") {
    return { ok: false, reason: "invalid_state" };
  }
  const now = Date.now();
  const next: ChatInteractionRecord = {
    ...target,
    resumeRunId: params.resumeRunId,
    lastResumeAtMs: now,
    resumeAttempts: (target.resumeAttempts ?? 0) + 1,
    updatedAt: now,
  };
  store.interactions[idx] = next;
  await writeStore(params.sessionStorePath, store);
  return { ok: true, interaction: next };
}

export async function listRecoverableSubmittedInteractions(params: {
  sessionStorePath: string;
  minStaleMs: number;
  maxAttempts: number;
  limit: number;
  nowMs?: number;
}): Promise<ChatInteractionRecord[]> {
  const store = await readStore(params.sessionStorePath);
  const now = params.nowMs ?? Date.now();
  return store.interactions
    .filter((item) => {
      if (item.status !== "submitted") {
        return false;
      }
      const attempts = item.resumeAttempts ?? 0;
      if (attempts >= params.maxAttempts) {
        return false;
      }
      const lastResumeAtMs =
        item.lastResumeAtMs ?? item.updatedAt ?? item.submittedAt ?? item.createdAt;
      return now - lastResumeAtMs >= params.minStaleMs;
    })
    .sort((a, b) => {
      const aTs = a.lastResumeAtMs ?? a.updatedAt ?? a.submittedAt ?? a.createdAt;
      const bTs = b.lastResumeAtMs ?? b.updatedAt ?? b.submittedAt ?? b.createdAt;
      return aTs - bTs;
    })
    .slice(0, params.limit);
}
