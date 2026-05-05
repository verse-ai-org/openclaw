// ---------------------------------------------------------------------------
// Bridge internal types (runtime bookkeeping + outcomes)
// ---------------------------------------------------------------------------

export type BridgeDropReason =
  | "stale"
  | "inactive_session"
  | "missing_session_key"
  | "missing_payload_data"
  | "unhandled_state"
  | "unhandled_stream";

export type BridgeEventOutcome =
  | { kind: "applied"; summary?: string }
  | { kind: "finalized"; summary?: string }
  | { kind: "ignored"; reason: BridgeDropReason; summary?: string };

export type BridgeRuntimeContext = {
  pendingInteractiveHydrationRuns: Set<string>;
  pendingToolResults: Map<
    string,
    { phase: "result" | "error"; data: Record<string, unknown> }
  >;
  activeRunBySession: Map<string, string>;
  finalizedRunBySession: Map<string, string>;
};

