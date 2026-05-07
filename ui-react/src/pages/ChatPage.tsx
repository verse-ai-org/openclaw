import { GatewayChatRuntimeProvider } from "@/components/chat/gateway/providers";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ThreadView } from "@/components/chat/ThreadView";
import { useGatewayEventBridge } from "@/components/chat/gateway";

export function ChatPage() {
  useGatewayEventBridge();

  return (
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
  );
}
