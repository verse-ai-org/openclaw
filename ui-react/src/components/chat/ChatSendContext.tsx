import { createContext, useContext } from "react";

interface ChatSendContextValue {
  sendMessage: (text: string) => Promise<void>;
  /**
   * Respond to a pending `<ask>` interaction by id. Maps to the gateway RPC
   * `chat.interactionRespond`. The runtime provider wires this up; any UI
   * renderer (QuestionFlow, OptionList, custom components) can call it
   * without going through `sendMessage(text)`.
   */
  respondInteraction?: (args: {
    interactionId: string;
    data: unknown;
    status?: "submitted" | "cancelled";
  }) => Promise<void>;
}

export const ChatSendContext = createContext<ChatSendContextValue | null>(null);

export function useChatSend(): ChatSendContextValue {
  const ctx = useContext(ChatSendContext);
  if (!ctx) {
    throw new Error("useChatSend must be used inside GatewayChatRuntimeProvider");
  }
  return ctx;
}
