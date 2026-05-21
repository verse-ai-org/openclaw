import { AlertTriangleIcon, LoaderIcon, Minimize2Icon } from "lucide-react";
import { type FC, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  contextNoticeTitle,
  getContextNoticeViewModel,
} from "@/components/chat/context-notice";
import { useChatSend } from "@/components/chat/ChatSendContext";
import { resolveActiveChatSessionKey } from "@/components/chat/session/active-session";
import { useChatStore } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import {
  resolveActiveSessionEntry,
  useSessionsStore,
} from "@/store/sessions.store";
import { useSettingsStore } from "@/store/settings.store";

export const ContextNotice: FC = () => {
  const sessionKey = useChatStore((s) => s.sessionKey);
  const sending = useChatStore((s) => s.sending);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = resolveActiveChatSessionKey(sessionKey, settingsSessionKey);
  const sessions = useSessionsStore((s) => s.sessions);
  const defaults = useSessionsStore((s) => s.defaults);
  const connected = useGatewayStore((s) => s.status === "connected");
  const activeSession = resolveActiveSessionEntry(sessions, activeSessionKey);
  const defaultContextTokens =
    typeof defaults?.contextTokens === "number" && defaults.contextTokens > 0
      ? defaults.contextTokens
      : null;

  const model = useMemo(
    () => getContextNoticeViewModel(activeSession, defaultContextTokens),
    [activeSession, defaultContextTokens],
  );

  const [compactBusy, setCompactBusy] = useState(false);
  const { sendMessage } = useChatSend();

  if (!model) {
    return null;
  }

  const showCompact = model.compactRecommended;
  const compactDisabled = !connected || sending || compactBusy;

  async function handleCompact() {
    if (compactDisabled) {
      return;
    }
    setCompactBusy(true);
    try {
      await sendMessage("/compact");
    } finally {
      setCompactBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "mx-auto flex flex-wrap items-center justify-center gap-2 backdrop-blur-md",
        "rounded-full border px-3.5 py-1.5 text-[13px] leading-tight select-none",
        "animate-in fade-in duration-200",
        model.warning
          ? "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-border/70 bg-muted/30 text-muted-foreground",
      )}
      role="status"
      title={contextNoticeTitle(model)}
    >
      {model.warning ? (
        <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
      ) : (
        <span
          className="relative h-1.5 w-11 shrink-0 overflow-hidden rounded-full bg-current/15"
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-current"
            style={{ width: `${model.pct}%` }}
          />
        </span>
      )}
      <span className="font-medium tabular-nums">{model.pct}% context used</span>
      <span className="tabular-nums text-current/70">{model.detail}</span>
      {showCompact && (
        <button
          type="button"
          disabled={compactDisabled}
          onClick={() => {
            void handleCompact();
          }}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
            "border-current/35 bg-current/10 hover:bg-current/15",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          title="Compact session context"
          aria-label="Compact recommended session context"
        >
          {compactBusy ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <Minimize2Icon className="size-3" />
          )}
          <span>{compactBusy ? "Compacting" : "Compact"}</span>
        </button>
      )}
    </div>
  );
};
