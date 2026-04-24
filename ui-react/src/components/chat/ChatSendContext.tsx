import { createContext, useContext } from "react";
import type { ChatMessageMetadata } from "@/store/chat.store";

interface ChatSendContextValue {
  sendMessage: (text: string, options?: { metadata?: ChatMessageMetadata }) => Promise<void>;
}

export const ChatSendContext = createContext<ChatSendContextValue | null>(null);

export function useChatSend(): ChatSendContextValue {
  const ctx = useContext(ChatSendContext);
  if (!ctx) {
    throw new Error("useChatSend must be used inside GatewayChatRuntimeProvider");
  }
  return ctx;
}
