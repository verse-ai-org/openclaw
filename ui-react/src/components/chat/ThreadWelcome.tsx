import { useComposerRuntime, useAuiState } from "@assistant-ui/react";
import { type FC, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  getAgentWelcomeConfig,
  parseAgentIdFromSessionKey,
  type AgentStarterPrompt,
} from "@/lib/agent-starter-prompts";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import { resolveActiveChatSessionKey } from "./session/active-session";

function resolveAgentDisplayName(
  agentId: string,
  agents: { id: string; name?: string; identity?: { name?: string } }[] | undefined,
): string {
  const row = agents?.find((a) => a.id === agentId);
  return row?.identity?.name ?? row?.name ?? agentId;
}

// ---------------------------------------------------------------------------
// Empty-thread welcome: agent name + optional starter cards (built-in only).
// ---------------------------------------------------------------------------
export const ThreadWelcome: FC = () => {
  const composerRuntime = useComposerRuntime();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const chatSessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const sessionKey = resolveActiveChatSessionKey(chatSessionKey, settingsSessionKey);

  const agentsList = useAgentsStore((s) => s.agentsList);
  const loadAgents = useAgentsStore((s) => s.loadAgents);
  const isConnected = useGatewayStore((s) => s.status === "connected");

  useEffect(() => {
    if (isConnected && !agentsList) {
      void loadAgents();
    }
  }, [isConnected, agentsList, loadAgents]);

  const defaultAgentId = agentsList?.defaultId ?? "main";
  const agentId = parseAgentIdFromSessionKey(sessionKey, defaultAgentId);
  const displayName = resolveAgentDisplayName(agentId, agentsList?.agents);
  const welcomeConfig = getAgentWelcomeConfig(agentId);

  const handleSelectPrompt = useCallback(
    (prompt: AgentStarterPrompt) => {
      if (isRunning) {
        return;
      }
      composerRuntime.setText(prompt.message);
      void composerRuntime.send({ startRun: true });
    },
    [composerRuntime, isRunning],
  );

  const headline = welcomeConfig?.headline;
  const prompts = welcomeConfig?.prompts ?? [];

  return (
    <div className="mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col items-center justify-center gap-6 px-2 py-8">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
        <p className="text-muted-foreground text-sm">
          {headline ?? "发一条消息开始对话。"}
        </p>
      </div>

      {prompts.length > 0 && (
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {prompts.map((prompt) => (
            <StarterPromptCard
              key={`${prompt.title}-${prompt.subtitle ?? ""}`}
              prompt={prompt}
              disabled={isRunning}
              onSelect={() => handleSelectPrompt(prompt)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type StarterPromptCardProps = {
  prompt: AgentStarterPrompt;
  disabled: boolean;
  onSelect: () => void;
};

const StarterPromptCard: FC<StarterPromptCardProps> = ({
  prompt,
  disabled,
  onSelect,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onSelect}
    className={cn(
      "flex min-h-[4.5rem] flex-col items-start gap-0.5 rounded-2xl border border-border",
      "bg-card px-4 py-3.5 text-left transition-colors",
      "hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]",
      "disabled:pointer-events-none disabled:opacity-50",
    )}
  >
    <span className="text-sm font-medium text-foreground">{prompt.title}</span>
    {prompt.subtitle ? (
      <span className="text-xs text-muted-foreground line-clamp-2">
        {prompt.subtitle}
      </span>
    ) : null}
  </button>
);
