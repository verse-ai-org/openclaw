import { useCallback, useEffect, useState } from "react";
import type { StartupPhase, StartupPhasePayload } from "@/types/startup";
import { defaultMessageForPhase } from "./boot-phases";

type ElectronStartupBridge = {
  onStartupPhase?: (
    callback: (payload: StartupPhasePayload) => void,
  ) => (() => void) | void;
  getStartupPhase?: () => Promise<StartupPhasePayload | null>;
  retryStartup?: () => Promise<{ ok: boolean; error?: string }>;
};

function getStartupBridge(): ElectronStartupBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronBridge?: ElectronStartupBridge }).electronBridge;
}

function normalizePayload(raw: StartupPhasePayload): StartupPhasePayload {
  const phase = raw.phase as StartupPhase;
  return {
    ...raw,
    phase,
    message: raw.message ?? defaultMessageForPhase(phase),
  };
}

export function useBootProgress() {
  const [payload, setPayload] = useState<StartupPhasePayload>({
    phase: "starting",
    message: defaultMessageForPhase("starting"),
    elapsedMs: 0,
  });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const bridge = getStartupBridge();
    if (!bridge?.onStartupPhase) return;

    void bridge.getStartupPhase?.().then((initial) => {
      if (initial) {
        setPayload(normalizePayload(initial));
      }
    });

    const unsubscribe = bridge.onStartupPhase((next) => {
      setPayload(normalizePayload(next as StartupPhasePayload));
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const retry = useCallback(async () => {
    const bridge = getStartupBridge();
    if (!bridge?.retryStartup) return;
    setRetrying(true);
    try {
      await bridge.retryStartup();
    } finally {
      setRetrying(false);
    }
  }, []);

  return { payload, retry, retrying };
}
