import { GatewayChatRuntimeProvider } from "@/components/chat/GatewayChatRuntimeProvider";
import { SessionSelector } from "@/components/chat/SessionSelector";
import { ThreadView } from "@/components/chat/ThreadView";
import { useChatEventBridge } from "@/hooks/useChatEventBridge";

export function ChatPage() {
  // Bridge gateway events → chat store (registers/unregisters on mount/unmount)
  useChatEventBridge();

  return (
    <GatewayChatRuntimeProvider>
      <div className="flex h-full flex-col">
        <SessionSelector />
        <div className="flex flex-1 w-full overflow-hidden">
          <ThreadView />
        </div>
      </div>
    </GatewayChatRuntimeProvider>
  );
}
