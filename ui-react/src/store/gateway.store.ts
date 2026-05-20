import { create } from "zustand";
import type {
  GatewayErrorInfo,
  GatewayEventFrame,
  GatewayHelloOk,
  HealthSnapshot,
  PresenceEntry,
  StatusSummary,
  UpdateAvailable,
} from "@/types/gateway";

// ---------------------------------------------------------------------------
// Chat event dispatch callback — injected from useChatEventBridge to avoid
// direct circular dependency between gateway.store and chat.store.
// ---------------------------------------------------------------------------
export type ChatEventDispatch = (event: string, payload: unknown) => void;

let _chatDispatch: ChatEventDispatch | null = null;

export function registerChatDispatch(fn: ChatEventDispatch) {
  _chatDispatch = fn;
}

export function unregisterChatDispatch() {
  _chatDispatch = null;
}

// ---------------------------------------------------------------------------
// Client interface – matches GatewayBrowserClient from ui/src/ui/gateway.ts
// We reference the shape without a direct import to avoid Lit dependency.
// ---------------------------------------------------------------------------
export interface IGatewayClient {
  start(): void;
  stop(): void;
  get connected(): boolean;
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Progress copy for GatewayRestartingOverlay during config apply. */
export type ConfigApplyPhase = "idle" | "applying" | "restarting" | "reconnecting";

interface GatewayState {
  // Connection
  status: ConnectionStatus;
  client: IGatewayClient | null;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  lastErrorCode: string | null;
  serverVersion: string | null;

  // Set to true when a user action intentionally triggers a Gateway restart.
  // Cleared automatically when the connection is re-established.
  // Used by the global GatewayRestartingOverlay to distinguish intentional
  // restarts from unexpected disconnects.
  restarting: boolean;
  configApplyPhase: ConfigApplyPhase;

  // Presence / health (populated from hello snapshot + events)
  presenceEntries: PresenceEntry[];
  debugHealth: HealthSnapshot | null;
  presenceStatus: StatusSummary | null;

  // Update banner
  updateAvailable: UpdateAvailable | null;

  // Event log (for debug tab)
  eventLogBuffer: Array<{ ts: number; event: string; payload: unknown }>;

  // Actions
  setClient: (client: IGatewayClient | null) => void;
  setConnected: (hello: GatewayHelloOk) => void;
  setDisconnected: (info: { code: number; reason: string; error?: GatewayErrorInfo }) => void;
  setConnecting: () => void;
  handleEvent: (evt: GatewayEventFrame) => void;
  reset: () => void;
  /** Mark that we are applying config (plugin/channel enable, install, etc.). */
  beginConfigApply: () => void;
  /** @deprecated Prefer beginConfigApply */
  beginRestart: () => void;
  /** Clear intentional restart state when no restart actually happens. */
  endRestart: () => void;
  /**
   * After a config write: wait briefly for an optional WS drop (SIGUSR1), then
   * reconnect. If the gateway hot-reloads without disconnecting, returns while still connected.
   */
  waitForConfigApplySettle: (options?: { reconnectTimeoutMs?: number }) => Promise<void>;
}

const MAX_EVENT_LOG = 250;

export const useGatewayStore = create<GatewayState>()((set, get) => ({
  status: "disconnected",
  client: null,
  hello: null,
  lastError: null,
  lastErrorCode: null,
  serverVersion: null,
  restarting: false,
  configApplyPhase: "idle",
  presenceEntries: [],
  debugHealth: null,
  presenceStatus: null,
  updateAvailable: null,
  eventLogBuffer: [],

  setClient: (client) => set({ client }),

  setConnecting: () =>
    set({
      status: "connecting",
      lastError: null,
      lastErrorCode: null,
    }),

  setConnected: (hello) => {
    const snapshot = hello.snapshot as
      | {
          presence?: PresenceEntry[];
          health?: HealthSnapshot;
          updateAvailable?: UpdateAvailable;
        }
      | undefined;

    set({
      status: "connected",
      // Clear restarting flag — Gateway is back up.
      restarting: false,
      configApplyPhase: "idle",
      hello,
      lastError: null,
      lastErrorCode: null,
      serverVersion: hello.server?.version ?? null,
      presenceEntries: snapshot?.presence ?? get().presenceEntries,
      debugHealth: snapshot?.health ?? get().debugHealth,
      updateAvailable: snapshot?.updateAvailable ?? null,
    });
  },

  beginConfigApply: () =>
    set({
      restarting: true,
      configApplyPhase: "applying",
    }),
  beginRestart: () => get().beginConfigApply(),
  endRestart: () =>
    set({
      restarting: false,
      configApplyPhase: "idle",
    }),

  waitForConfigApplySettle: async (options) => {
    const reconnectTimeoutMs = options?.reconnectTimeoutMs ?? 60_000;
    const disconnectWindowMs = 2_500;
    const start = Date.now();
    while (Date.now() - start < disconnectWindowMs) {
      if (get().status !== "connected") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (get().status === "connected") {
      return;
    }
    const deadline = Date.now() + reconnectTimeoutMs;
    while (get().status !== "connected") {
      if (Date.now() > deadline) {
        throw new Error(
          "Gateway did not reconnect after configuration change. Try Refresh.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  },

  setDisconnected: ({ code, reason, error }) => {
    // Code 1012 = Service Restart (expected, not an error)
    const isExpectedRestart = code === 1012;
    const wasConnected = get().status === "connected";
    let configApplyPhase = get().configApplyPhase;
    if (get().restarting) {
      if (code === 1012) {
        configApplyPhase = "restarting";
      } else if (wasConnected || configApplyPhase === "applying") {
        configApplyPhase = "reconnecting";
      }
    }
    set({
      status: "disconnected",
      hello: null,
      configApplyPhase,
      lastError: isExpectedRestart
        ? null
        : (error?.message ?? `disconnected (${code}): ${reason || "no reason"}`),
      lastErrorCode: error?.code ?? null,
    });
  },

  handleEvent: (evt) => {
    // Always buffer events for debug tab
    set((state) => ({
      eventLogBuffer: [
        { ts: Date.now(), event: evt.event, payload: evt.payload },
        ...state.eventLogBuffer,
      ].slice(0, MAX_EVENT_LOG),
    }));

    if (evt.event === "presence") {
      const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
      if (Array.isArray(payload?.presence)) {
        set({ presenceEntries: payload.presence, presenceStatus: null });
      }
      return;
    }

    if (evt.event === "update.available") {
      const payload = evt.payload as { updateAvailable?: UpdateAvailable } | undefined;
      set({ updateAvailable: payload?.updateAvailable ?? null });
      return;
    }

    if (evt.event === "health") {
      set({ debugHealth: evt.payload as HealthSnapshot });
      return;
    }

    // Delegate channels snapshot events to the channels store.
    if (evt.event === "channels.status" || evt.event === "channels.status.v2") {
      // Lazy import to avoid circular dependency at module load time.
      import("./channels.store").then(({ useChannelsStore }) => {
        const snapshot = (evt.payload as { snapshot?: unknown })?.snapshot ?? evt.payload;
        if (snapshot && typeof snapshot === "object" && "channels" in (snapshot as object)) {
          useChannelsStore
            .getState()
            .applySnapshot(snapshot as import("@/types/channels").ChannelsStatusSnapshot);
        }
      }).catch(() => {});
      return;
    }

    // Delegate chat-specific and agent events to the registered chat dispatch handler.
    // This avoids importing chat.store here and keeps the dependency direction clean.
    if (
      evt.event === "chat" ||
      evt.event === "agent" ||
      evt.event.startsWith("chat.") ||
      evt.event.startsWith("tool.")
    ) {
      _chatDispatch?.(evt.event, evt.payload);
      return;
    }
  },

  reset: () =>
    set({
      status: "disconnected",
      client: null,
      hello: null,
      lastError: null,
      lastErrorCode: null,
      serverVersion: null,
      restarting: false,
      configApplyPhase: "idle",
      presenceEntries: [],
      debugHealth: null,
      presenceStatus: null,
      updateAvailable: null,
      eventLogBuffer: [],
    }),
}));
