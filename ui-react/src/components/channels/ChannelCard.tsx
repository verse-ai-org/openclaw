import { Loader2Icon, CheckCircle2Icon, XCircleIcon, AlertCircleIcon, SettingsIcon, WifiIcon, WifiOffIcon, MessageSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChannelsStore } from "@/store/channels.store";
import type { ChannelAccountSnapshot } from "@/types/channels";
import { getChannelLogoUrl } from "./shared/channel-logos";

type DotStatus = "running" | "error" | "idle" | "disabled";

export function isChannelEnabled(accounts: ChannelAccountSnapshot[]): boolean {
  return accounts.length === 0 || accounts.some((a) => a.enabled !== false);
}

export function channelStatusDot(accounts: ChannelAccountSnapshot[]): DotStatus {
  if (!isChannelEnabled(accounts)) { return "disabled"; }
  if (!accounts.length) { return "idle"; }
  if (accounts.some((a) => a.running)) { return "running"; }
  if (accounts.some((a) => a.lastError)) { return "error"; }
  return "idle";
}

export function ChannelCard({
  channelId, label, detailLabel, accounts, onOpen, onDisable, onEnable,
}: {
  channelId: string;
  label: string;
  detailLabel?: string;
  accounts: ChannelAccountSnapshot[];
  onOpen: () => void;
  onDisable?: () => void;
  onEnable?: () => void;
}) {
  const togglingChannelId = useChannelsStore((s) => s.togglingChannelId);
  const toggleChannelError = useChannelsStore((s) => s.toggleChannelError);
  const isToggling = togglingChannelId === channelId;
  const enabled = isChannelEnabled(accounts);
  const dot = channelStatusDot(accounts);
  const errMsg = toggleChannelError[channelId];
  const running = accounts.filter((a) => a.running).length;
  const configured = accounts.some((a) => a.configured);
  const needsSetup = enabled && (accounts.length === 0 || !configured);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (enabled) {
      onDisable?.();
    } else {
      onEnable?.();
    }
  };

  return (
    <div
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 cursor-pointer text-card-foreground",
        "transition-all hover:shadow-md hover:border-muted-foreground/40",
        !enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Channel Logo */}
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
              // Fallback to default icon if no logo
              return (
                <MessageSquareIcon className="size-8 text-muted-foreground" />
              );
            })()}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{label}</p>
            {detailLabel && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{detailLabel}</p>
            )}
          </div>
        </div>
        <button type="button" disabled={isToggling} onClick={handleToggle}
          className={cn(
            "shrink-0 transition-colors disabled:opacity-50",
            enabled
              ? "relative inline-flex h-6.5 w-11 cursor-pointer items-center rounded-full bg-primary"
              : "rounded-full bg-primary px-5 py-1.5 text-[12px] font-bold text-primary-foreground hover:bg-primary/90",
          )}
          title={enabled ? "Disable" : "Enable"}
        >
          {isToggling
            ? (
              <Loader2Icon
                className={cn(
                  "size-4 animate-spin text-primary-foreground",
                  enabled && "mx-auto",
                )}
              />
            )
            : enabled
            ? <span className="inline-block size-5.5 translate-x-5 rounded-full bg-primary-foreground shadow-sm transition-transform" />
            : "Enable"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {enabled && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {dot === "running" ? (
              <WifiIcon className="size-3 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <WifiOffIcon className="size-3" />
            )}
            {running}/{accounts.length} running
          </span>
        )}
        {enabled && configured && (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2Icon className="size-3 text-emerald-500 dark:text-emerald-400" />
            configured
          </span>
        )}
        {enabled && !configured && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <AlertCircleIcon className="size-3 text-amber-600 dark:text-amber-400" />
            not configured
          </span>
        )}
        {!enabled && (
          <span className="inline-flex items-center gap-1"><XCircleIcon className="size-3" />disabled</span>
        )}
      </div>

      {errMsg && <p className="text-[11px] text-destructive">{errMsg}</p>}

      {needsSetup ? (
        <div className="mt-auto pt-2 flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-500/10 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-500/15">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            <AlertCircleIcon className="size-3.5" /> Setup required to use
          </span>
          <span className="text-[11px] font-bold text-primary">Configure →</span>
        </div>
      ) : enabled ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground transition-colors mt-auto pt-1">
          <SettingsIcon className="size-3" />Configure
        </div>
      ) : null}
    </div>
  );
}
