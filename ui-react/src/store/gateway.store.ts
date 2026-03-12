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
}

const MAX_EVENT_LOG = 250;

export const useGatewayStore = create<GatewayState>()((set, get) => ({
  status: "disconnected",
  client: null,
  hello: null,
  lastError: null,
  lastErrorCode: null,
  serverVersion: null,
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
      hello,
      lastError: null,
      lastErrorCode: null,
      serverVersion: hello.server?.version ?? null,
      presenceEntries: snapshot?.presence ?? get().presenceEntries,
      debugHealth: snapshot?.health ?? get().debugHealth,
      updateAvailable: snapshot?.updateAvailable ?? null,
    });
  },

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
  },

  reset: () =>
    set({
      status: "disconnected",
      client: null,
      hello: null,
      lastError: null,
      lastErrorCode: null,
      serverVersion: null,
      presenceEntries: [],
      debugHealth: null,
      presenceStatus: null,
      updateAvailable: null,
      eventLogBuffer: [],
    }),
}));
