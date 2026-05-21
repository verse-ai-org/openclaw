// ---------------------------------------------------------------------------
// Gateway wire payload types (ingress boundary)
// ---------------------------------------------------------------------------

/** Raw gateway message shape before normalization (e.g. chat.history). */
export type RawMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  text?: string;
  /** Gateway may attach file display hints when user content is shortened for history. */
  attachments?: unknown;
  metadata?: unknown;
  ts?: number;
  timestamp?: number;
  runId?: string;
  sessionKey?: string;
  usage?: unknown;
  cost?: unknown;
  model?: string;
};

export type GatewayChatEventState =
  | "delta"
  | "final"
  | "error"
  | "aborted"
  | (string & {});

export type GatewayContentBlock =
  | { type: "text"; text: string }
  | { type: string; [k: string]: unknown };

export type GatewayChatMessage = {
  role?: string;
  content?: unknown;
  timestamp?: number;
  text?: string;
  [k: string]: unknown;
};

export type GatewayChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  seq?: number;
  state?: GatewayChatEventState;
  message?: GatewayChatMessage;
  errorMessage?: string;
  stopReason?: string;
  [k: string]: unknown;
};

export type GatewayAgentEventStream =
  | "lifecycle"
  | "tool"
  | "assistant"
  | "error"
  | (string & {});

export type GatewayAgentToolPhase =
  | "start"
  | "update"
  | "result"
  | "error"
  | (string & {});

export type GatewayAgentToolDataBase = {
  phase?: GatewayAgentToolPhase;
  name?: string;
  toolCallId?: string;
  meta?: string;
  isError?: boolean;
  args?: unknown;
  partialResult?: unknown;
  result?: unknown;
  error?: unknown;
  [k: string]: unknown;
};

export type GatewayAgentToolStartData = GatewayAgentToolDataBase & {
  phase: "start";
};

export type GatewayAgentToolUpdateData = GatewayAgentToolDataBase & {
  phase: "update";
};

export type GatewayAgentToolResultData = GatewayAgentToolDataBase & {
  phase: "result";
};

export type GatewayAgentToolErrorData = GatewayAgentToolDataBase & {
  phase: "error";
};

export type GatewayAgentToolData =
  | GatewayAgentToolStartData
  | GatewayAgentToolUpdateData
  | GatewayAgentToolResultData
  | GatewayAgentToolErrorData
  | (GatewayAgentToolDataBase & {
      phase?: Exclude<GatewayAgentToolPhase, "start" | "update" | "result" | "error">;
    });

export type GatewayAgentLifecycleData = {
  phase?: "start" | "end" | "error" | (string & {});
  error?: string;
  stopReason?: string;
  startedAt?: number;
  endedAt?: number;
  [k: string]: unknown;
};

export type GatewayAgentAssistantData = {
  text?: string;
  delta?: string;
  mediaUrls?: unknown;
  [k: string]: unknown;
};

export type GatewayAgentEventPayload = {
  runId: string;
  seq?: number;
  stream: GatewayAgentEventStream;
  ts?: number;
  sessionKey?: string;
  data: Record<string, unknown>;
  [k: string]: unknown;
};

