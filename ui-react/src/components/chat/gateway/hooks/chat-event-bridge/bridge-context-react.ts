import { createContext, useContext } from "react";
import type { BridgeRuntimeContext } from "@/components/chat/types";

/**
 * React Context that carries the `BridgeRuntimeContext` created by
 * `useGatewayEventBridge`. Using React Context instead of a module singleton
 * ties the context lifetime to the component tree and allows proper test
 * isolation (each test renders its own provider).
 */
export const BridgeChatContext = createContext<BridgeRuntimeContext | null>(null);

export function useBridgeChatContext(): BridgeRuntimeContext | null {
  return useContext(BridgeChatContext);
}
