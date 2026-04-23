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
  /** Mark that we are intentionally waiting for Gateway to restart. */
  beginRestart: () => void;
  /** Clear intentional restart state when no restart actually happens. */
  endRestart: () => void;
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
      hello,
      lastError: null,
      lastErrorCode: null,
      serverVersion: hello.server?.version ?? null,
      presenceEntries: snapshot?.presence ?? get().presenceEntries,
      debugHealth: snapshot?.health ?? get().debugHealth,
      updateAvailable: snapshot?.updateAvailable ?? null,
    });
  },

  beginRestart: () => set({ restarting: true }),
  endRestart: () => set({ restarting: false }),

  setDisconnected: ({ code, reason, error }) => {
    // Code 1012 = Service Restart (expected, not an error)
    const isExpectedRestart = code === 1012;
    set({
      status: "disconnected",
      hello: null,
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
      presenceEntries: [],
      debugHealth: null,
      presenceStatus: null,
      updateAvailable: null,
      eventLogBuffer: [],
    }),
}));
