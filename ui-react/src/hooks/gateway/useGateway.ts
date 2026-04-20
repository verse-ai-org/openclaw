import { useCallback, useEffect, useRef } from "react";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { GatewayClient } from "./client";

export function useGateway() {
  const settings = useSettingsStore((s) => s.settings);
  const password = useSettingsStore((s) => s.password);
  const { setClient, setConnecting, setConnected, setDisconnected, handleEvent } =
    useGatewayStore();

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
    console.log(
      "[gateway] connect() called | prev client serial=",
      (clientRef.current as (GatewayClient & { serial?: number }) | null)?.serial ??
        "none",
    );
    setConnectingRef.current();

    const { gatewayUrl, token, password: pw } = settingsRef.current;
    console.log(
      `[gateway] connect() using url=${gatewayUrl} token=${token ? `${token.slice(0, 8)}...` : "(none)"}`,
    );
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
  useEffect(() => {
    connect();
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayUrl, token]);

  return { connect };
}
