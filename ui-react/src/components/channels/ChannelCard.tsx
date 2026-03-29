import { Loader2Icon, CheckCircle2Icon, XCircleIcon, AlertCircleIcon, SettingsIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChannelsStore } from "@/store/channels.store";
import type { ChannelAccountSnapshot } from "@/types/channels";

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
  channelId, label, detailLabel, accounts, onOpen, onDisable,
}: {
  channelId: string;
  label: string;
  detailLabel?: string;
  accounts: ChannelAccountSnapshot[];
  onOpen: () => void;
  onDisable?: () => void;
}) {
  const togglingChannelId = useChannelsStore((s) => s.togglingChannelId);
  const toggleChannelError = useChannelsStore((s) => s.toggleChannelError);
  const enableChannel = useChannelsStore((s) => s.enableChannel);
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
      void enableChannel(channelId, true);
    }
  };

  return (
    <div
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-white p-5 cursor-pointer",
        "transition-all hover:shadow-md hover:border-[#E0E0E0]",
        !enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn(
            "size-2.5 rounded-full shrink-0 mt-0.5",
            dot === "running" && "bg-emerald-500",
            dot === "error" && "bg-red-500",
            dot === "idle" && "bg-amber-400",
            dot === "disabled" && "bg-[#D1D5DB]",
          )} />
          <div>
            <p className="text-sm font-semibold text-[#111827] leading-tight">{label}</p>
            {detailLabel && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{detailLabel}</p>}
          </div>
        </div>
        <button type="button" disabled={isToggling} onClick={handleToggle}
          className={cn(
            "shrink-0 transition-colors disabled:opacity-50",
            enabled
              ? "relative inline-flex h-[26px] w-[44px] cursor-pointer items-center rounded-full bg-primary"
              : "rounded-full bg-primary px-5 py-[6px] text-[12px] font-bold text-white hover:bg-primary/90",
          )}
          title={enabled ? "Disable" : "Enable"}
        >
          {isToggling
            ? <Loader2Icon className={cn("size-4 animate-spin", enabled ? "mx-auto text-white" : "")} />
            : enabled
            ? <span className="inline-block size-[22px] translate-x-[20px] rounded-full bg-white shadow-sm transition-transform" />
            : "Enable"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6B7280]">
        {enabled && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {dot === "running" ? <WifiIcon className="size-3 text-emerald-500" /> : <WifiOffIcon className="size-3" />}
            {running}/{accounts.length} running
          </span>
        )}
        {enabled && configured && (
          <span className="inline-flex items-center gap-1"><CheckCircle2Icon className="size-3 text-emerald-500" />configured</span>
        )}
        {enabled && !configured && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1"><AlertCircleIcon className="size-3 text-amber-400" />not configured</span>
        )}
        {!enabled && (
          <span className="inline-flex items-center gap-1"><XCircleIcon className="size-3" />disabled</span>
        )}
      </div>

      {errMsg && <p className="text-[11px] text-red-500">{errMsg}</p>}

      {needsSetup ? (
        <div className="mt-auto pt-2 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
            <AlertCircleIcon className="size-3.5" /> Setup required to use
          </span>
          <span className="text-[11px] font-bold text-primary">Configure →</span>
        </div>
      ) : enabled ? (
        <div className="flex items-center gap-1 text-[11px] text-[#9CA3AF] group-hover:text-[#6B7280] transition-colors mt-auto pt-1">
          <SettingsIcon className="size-3" />Configure
        </div>
      ) : null}
    </div>
  );
}
