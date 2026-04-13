import { createContext, useContext } from "react";

interface ChatSendContextValue {
  sendMessage: (text: string) => Promise<void>;
}

export const ChatSendContext = createContext<ChatSendContextValue | null>(null);

export function useChatSend(): ChatSendContextValue {
  const ctx = useContext(ChatSendContext);
  if (!ctx) {
    throw new Error("useChatSend must be used inside GatewayChatRuntimeProvider");
  }
  return ctx;
}
