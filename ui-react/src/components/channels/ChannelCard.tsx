import {
  CheckCircle2Icon,
  AlertCircleIcon,
  SettingsIcon,
  WifiIcon,
  WifiOffIcon,
  MessageSquareIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  channelNeedsSetup,
  isPluginActiveLifecycle,
  type ChannelLifecycle,
} from "@/lib/channel-lifecycle";
import { useChannelsStore } from "@/store/channels.store";
import type { ChannelAccountSnapshot } from "@/types/channels";
import { ChannelLifecycleBadge } from "@/components/channels/ChannelLifecycleBadge";
import { ChannelPrimaryControl } from "@/components/channels/ChannelPrimaryControl";
import { getChannelLogoUrl } from "./shared/channel-logos";

/** @deprecated Use resolveChannelLifecycle + isPluginActiveLifecycle instead. */
export function isChannelEnabled(accounts: ChannelAccountSnapshot[]): boolean {
  if (accounts.length === 0) {
    return false;
  }
  return accounts.some((account) => account.enabled !== false);
}

export function ChannelCard({
  channelId,
  label,
  detailLabel,
  accounts,
  lifecycle,
  onOpen,
  onDisable,
  onEnable,
}: {
  channelId: string;
  label: string;
  detailLabel?: string;
  accounts: ChannelAccountSnapshot[];
  lifecycle: ChannelLifecycle;
  onOpen: () => void;
  onDisable?: () => void;
  onEnable?: () => void;
}) {
  const togglingChannelId = useChannelsStore((s) => s.togglingChannelId);
  const toggleChannelError = useChannelsStore((s) => s.toggleChannelError);
  const isToggling = togglingChannelId === channelId;
  const pluginActive = isPluginActiveLifecycle(lifecycle);
  const showEnablePill = lifecycle === "channel_disabled";
  const showLifecycleBadge = lifecycle !== "channel_disabled";
  // Plugin is on in config (including needs_setup) — toggle turns the channel off.
  const showDisableToggle = isPluginActiveLifecycle(lifecycle);
  const needsSetup = channelNeedsSetup(lifecycle);
  const errMsg = toggleChannelError[channelId];
  const running = accounts.filter((account) => account.running).length;

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDisableToggle) {
      onDisable?.();
      return;
    }
    onEnable?.();
  };

  const handleSetupClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 cursor-pointer text-card-foreground",
        "transition-all hover:shadow-md hover:border-muted-foreground/40",
        !pluginActive && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 mt-0.5">
            {(() => {
              const logoUrl = getChannelLogoUrl(channelId);
              if (logoUrl) {
                return (
                  <img
                    src={logoUrl}
                    alt={label}
                    className="size-8 object-contain"
                    loading="lazy"
                  />
                );
              }
              return <MessageSquareIcon className="size-8 text-muted-foreground" />;
            })()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold leading-tight">{label}</p>
              {showLifecycleBadge && <ChannelLifecycleBadge lifecycle={lifecycle} />}
            </div>
            {detailLabel && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{detailLabel}</p>
            )}
          </div>
        </div>
        {(showEnablePill || showDisableToggle) && (
          <ChannelPrimaryControl
            mode={showDisableToggle ? "toggle-on" : "enable-pill"}
            busy={isToggling}
            onClick={handlePrimaryAction}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {pluginActive && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {lifecycle === "running" ? (
              <WifiIcon className="size-3 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <WifiOffIcon className="size-3" />
            )}
            {running}/{accounts.length} running
          </span>
        )}
        {lifecycle === "configured" && (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2Icon className="size-3 text-emerald-500 dark:text-emerald-400" />
            ready
          </span>
        )}
        {lifecycle === "error" && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertCircleIcon className="size-3" />
            check error in details
          </span>
        )}
      </div>

      {errMsg && <p className="text-[11px] text-destructive">{errMsg}</p>}

      {needsSetup ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handleSetupClick}
          onKeyDown={(e) => e.key === "Enter" && handleSetupClick(e as unknown as React.MouseEvent)}
          className="mt-auto pt-2 flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-500/10 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-500/15 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            <AlertCircleIcon className="size-3.5" /> Complete setup to use
          </span>
          <span className="text-[11px] font-bold text-primary">Configure →</span>
        </div>
      ) : pluginActive ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground transition-colors mt-auto pt-1">
          <SettingsIcon className="size-3" />
          Configure
        </div>
      ) : null}
    </div>
  );
}
