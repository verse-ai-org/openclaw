import { type FC, useEffect, useMemo } from "react";
import { useChatStore } from "@/store/chat.store";
import { useAgentsStore } from "@/store/agents.store";
import { useSettingsStore } from "@/store/settings.store";
import { useGatewayStore } from "@/store/gateway.store";
import { AssistantLoadingIndicator } from "./assistant-loading-indicator.tsx";

// ---------------------------------------------------------------------------
// AgentAvatar
//
// Resolves the agent identity from the current sessionKey and renders:
//   - An <img> if the agent has an avatarUrl / avatar
//   - A rounded emoji badge otherwise (falls back to 🤖)
//
// When showLoading=true, renders AssistantLoadingIndicator beside the avatar.
// The caller is responsible for deciding which message should show loading
// (only the last/active message, not all historical messages).
//
// sessionKey format: "agent:<agentId>:<sessionId>" or a plain key.
// ---------------------------------------------------------------------------

export type AgentAvatarSize = "sm" | "md";

interface AgentAvatarProps {
  size?: AgentAvatarSize;
  /** When true, renders AssistantLoadingIndicator beside the avatar.
   *  Should only be true for the last (active) message in the thread. */
  showLoading?: boolean;
}

const SIZE_CLASS: Record<AgentAvatarSize, string> = {
  sm: "size-6 text-sm",
  md: "size-8 text-base",
};

export const AgentAvatar: FC<AgentAvatarProps> = ({ size = "md", showLoading = false }) => {
  // Mirror the same sessionKey resolution used by GatewayChatRuntimeProvider:
  // chat.store.sessionKey takes precedence; fall back to persisted settings.sessionKey.
  // This ensures we get the correct key even before useSessionManager writes to chat.store.
  const chatSessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const sessionKey = (chatSessionKey ?? settingsSessionKey ?? "main") || "main";

  const agentsList = useAgentsStore((s) => s.agentsList);
  const loadAgents = useAgentsStore((s) => s.loadAgents);
  const isConnected = useGatewayStore((s) => s.status === "connected");

  // Ensure agentsList is loaded — may not be available yet on first render
  // if the chat page is reached directly (e.g. after a page refresh).
  useEffect(() => {
    if (isConnected && !agentsList) {
      void loadAgents();
    }
  }, [isConnected, agentsList, loadAgents]);

  // isLoading is now driven by the showLoading prop passed from AssistantMessage,
  // which checks both pendingGenerationBySession AND whether this is the last message.
  // This prevents all historical message avatars from showing the loading indicator.

  const { emoji, avatarUrl, name } = useMemo(() => {
    // Parse agentId from "agent:<agentId>:<sessionId>" format
    const parts = sessionKey.split(":");
    const agentId = parts[0] === "agent" && parts[1] ? parts[1] : null;
    const agent = agentId
      ? agentsList?.agents.find((a) => a.id === agentId)
      : null;
    const ident = agent?.identity;
    return {
      emoji: ident?.emoji ?? "🤖",
      // avatarUrl takes precedence; fall back to legacy avatar field
      avatarUrl: ident?.avatarUrl ?? ident?.avatar ?? null,
      name: ident?.name ?? agent?.name ?? "AI",
    };
  }, [sessionKey, agentsList]);

  const sizeClass = SIZE_CLASS[size];

  const inner = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name}
      className={`${sizeClass} rounded-full object-contain shrink-0`}
    />
  ) : (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-primary/10`}
    >
      {emoji}
    </div>
  );

  return (
    <div className="flex flex-col justify-center items-center gap-2">
      {inner}
      {showLoading && <AssistantLoadingIndicator />}
    </div>
  );
};
