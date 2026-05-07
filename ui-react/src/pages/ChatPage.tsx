import { GatewayChatRuntimeProvider } from "@/components/chat/gateway/providers";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ThreadView } from "@/components/chat/ThreadView";
import { useGatewayEventBridge } from "@/components/chat/gateway";
import { BridgeChatContext } from "@/components/chat/gateway/hooks/chat-event-bridge/bridge-context-react";

export function ChatPage() {
  const bridgeCtx = useGatewayEventBridge();

  return (
    <BridgeChatContext.Provider value={bridgeCtx}>
      <GatewayChatRuntimeProvider>
        <div className="flex h-full overflow-hidden bg-white">
          {/* Sessions pane (Pane 2) */}
          <ChatSidebar />

          {/* Chat thread (Pane 3) */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            <ThreadView />
          </div>
        </div>
      </GatewayChatRuntimeProvider>
    </BridgeChatContext.Provider>
  );
}
