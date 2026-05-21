import { useCallback, useEffect, useRef } from "react";
import { useGatewayStore } from "@/store/gateway.store";
import { loadSettings, useSettingsStore } from "@/store/settings.store";
import { GatewayClient } from "./client";
import { parsePairingRequestId } from "./pairing-reason";
import { approveDevicePairingInDev } from "./dev-device-pairing";

type ElectronGatewayBridge = {
  approveDevicePairing?: (requestId?: string) => Promise<{ ok: boolean; error?: string }>;
};

function getElectronGatewayBridge(): ElectronGatewayBridge | null {
  const bridge = (window as unknown as { electronBridge?: ElectronGatewayBridge }).electronBridge;
  return bridge?.approveDevicePairing ? bridge : null;
}

export function useGateway() {
  const settings = useSettingsStore((s) => s.settings);
  const password = useSettingsStore((s) => s.password);
  const { setClient, setConnecting, setConnected, setDisconnected, handleEvent } = useGatewayStore();

  const storeRef = useRef({ setConnected, setDisconnected, handleEvent });
  storeRef.current = { setConnected, setDisconnected, handleEvent };

  const settingsRef = useRef({
    gatewayUrl: settings.gatewayUrl,
    token: settings.token,
    password,
  });

  settingsRef.current = {
    gatewayUrl: settings.gatewayUrl,
    token: settings.token,
    password,
  };

  const clientRef = useRef<GatewayClient | null>(null);
  const setClientRef = useRef(setClient);
  const setConnectingRef = useRef(setConnecting);
  setClientRef.current = setClient;
  setConnectingRef.current = setConnecting;

  const connect = useCallback(() => {
    clientRef.current?.stop();
    console.log(
      "[gateway] connect() called | prev client serial=",
      (clientRef.current as (GatewayClient & { serial?: number }) | null)?.serial ??
        "none",
    );
    setConnectingRef.current();

    const { gatewayUrl, token, password: pw } = settingsRef.current;
    console.log(`[gateway] connect() using url=${gatewayUrl} token=${token ? `${token.slice(0, 8)}...` : "(none)"}`);

    const client = new GatewayClient({
      url: gatewayUrl,
      token: token || undefined,
      password: pw || undefined,
      onHello: (hello) => {
        console.log("[gateway] hello-ok", hello.server?.version);
        storeRef.current.setConnected(hello);
      },
      onClose: (info) => {
        console.log(
          `[gateway] closed code=${info.code} reason=${info.reason || "(none)"} errorCode=${info.error?.code ?? "(none)"} errorMsg=${info.error?.message ?? "(none)"}`,
        );
        const reason = info.reason ?? "";
        const requestId = parsePairingRequestId(reason);
        const electronBridge = getElectronGatewayBridge();
        if (requestId && electronBridge) {
          void electronBridge
            .approveDevicePairing!(requestId)
            .then((result) => {
              if (result.ok) {
                console.log(`[gateway] device pairing approved requestId=${requestId}`);
                connect();
                return;
              }
              console.warn(
                `[gateway] device pairing approve failed requestId=${requestId}`,
                result.error ?? "",
              );
              connect();
            })
            .catch((err) => {
              console.warn("[gateway] device pairing approve threw", err);
              storeRef.current.setDisconnected(info);
            });
          return;
        }
        if (requestId && import.meta.env.DEV) {
          const token = settingsRef.current.token;
          void approveDevicePairingInDev({ requestId, token })
            .then((result) => {
              if (result.ok) {
                console.log(`[gateway] dev device pairing approved requestId=${requestId}`);
                connect();
                return;
              }
              console.warn(
                `[gateway] dev device pairing approve failed requestId=${requestId}`,
                result.error ?? "",
              );
              storeRef.current.setDisconnected(info);
            })
            .catch((err) => {
              console.warn("[gateway] dev device pairing approve threw", err);
              storeRef.current.setDisconnected(info);
            });
          return;
        }
        storeRef.current.setDisconnected(info);
      },
      onEvent: (evt) => storeRef.current.handleEvent(evt),
    });

    clientRef.current = client;

    setClientRef.current({
      start: () => client.start(),
      stop: () => client.stop(),
      get connected() {
        return client.connected;
      },
      request: (method, params) => client.request(method, params),
    });
    
    client.start();
  }, []);

  const gatewayUrl = settings.gatewayUrl;
  const token = settings.token;

  // Vite dev may HMR without re-running loadSettings(); resync auth from env.
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    if (location.hostname !== "localhost" || location.port !== "5174") {
      return;
    }
    const fresh = loadSettings();
    const current = useSettingsStore.getState().settings;
    if (
      fresh.token !== current.token ||
      fresh.gatewayUrl !== current.gatewayUrl
    ) {
      useSettingsStore.getState().updateSettings({
        token: fresh.token,
        gatewayUrl: fresh.gatewayUrl,
      });
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
    };
  }, [gatewayUrl, token]);

  return { connect };
}
