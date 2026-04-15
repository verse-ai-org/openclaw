import { useState } from "react";
import {
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePluginsStore } from "@/store/plugins.store";
import type { PluginRecord } from "@/types/plugins";
import { PluginDetailDialog } from "./PluginDetailDialog";
import { PluginToggleConfirmDialog } from "./PluginToggleConfirmDialog";

function StatusBadge({ status }: { status: PluginRecord["status"] }) {
  if (status === "loaded") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
        <CheckCircle2Icon className="size-3" /> loaded
      </span>
    );
  }
  if (status === "disabled") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full">
        disabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
      <XCircleIcon className="size-3" /> error
    </span>
  );
}

function OriginPill({ origin }: { origin: string }) {
  const colors: Record<string, string> = {
    bundled: "bg-[#EEF2FF] text-[#4F46E5]",
    global: "bg-[#FFF7ED] text-[#C2410C]",
    workspace: "bg-[#F0FDF4] text-[#166534]",
    config: "bg-[#FFF1F2] text-[#BE123C]",
  };
  return (
    <span
      className={cn(
        "inline-block text-[9px] font-bold px-2 py-[2px] rounded-md uppercase tracking-wide",
        colors[origin] ?? "bg-[#F2F2F7] text-[#8E8E93]",
      )}
    >
      {origin}
    </span>
  );
}

export function PluginCard({ plugin }: { plugin: PluginRecord }) {
  const togglingPluginId = usePluginsStore((s) => s.togglingPluginId);
  const toggleError = usePluginsStore((s) => s.toggleError);
  const enablePlugin = usePluginsStore((s) => s.enablePlugin);

  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingEnable, setPendingEnable] = useState<boolean>(false);

  const isToggling = togglingPluginId === plugin.id;
  const toggleErrMsg = toggleError[plugin.id];
  const canToggle = plugin.status !== "error" || !plugin.enabled;
  const isDisabled = !plugin.enabled;

  // plugin.error on a disabled plugin is just the disable reason (e.g. "bundled (disabled by default)")
  // — not an actual error. Only treat it as an error when status === "error".
  const hasRealError = plugin.status === "error";

  const pills = [
    plugin.toolNames.length > 0
      ? `${plugin.toolNames.length} tool${plugin.toolNames.length !== 1 ? "s" : ""}`
      : null,
    plugin.channelIds.length > 0
      ? `${plugin.channelIds.length} channel${plugin.channelIds.length !== 1 ? "s" : ""}`
      : null,
    plugin.services.length > 0
      ? `${plugin.services.length} service${plugin.services.length !== 1 ? "s" : ""}`
      : null,
    plugin.hookCount > 0
      ? `${plugin.hookCount} hook${plugin.hookCount !== 1 ? "s" : ""}`
      : null,
  ].filter(Boolean) as string[];

  function handleToggleClick(enabling: boolean) {
    setPendingEnable(enabling);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    setConfirmOpen(false);
    void enablePlugin(plugin.id, pendingEnable);
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col rounded-xl border p-8 transition-colors",
          isDisabled ? "bg-white/80 opacity-60" : "bg-white",
        )}
      >
        {/* Main row */}
        <div className="flex items-center gap-4">
          {/* Name + meta + description */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <span
                className={cn(
                  "truncate text-[15px] font-bold leading-snug",
                  isDisabled ? "text-muted-foreground" : "text-[#1A1C1D]",
                )}
              >
                {plugin.name}
              </span>
              {plugin.version && (
                <span className="text-[11px] text-[#8E8E93] font-mono shrink-0">
                  v{plugin.version}
                </span>
              )}
              <OriginPill origin={plugin.origin} />
              <StatusBadge status={plugin.status} />
            </div>
            {plugin.description && (
              <p
                className={cn(
                  "text-[12px] leading-[1.55] mt-0.5 line-clamp-2",
                  isDisabled ? "text-muted-foreground/50" : "text-muted-foreground",
                )}
              >
                {plugin.description}
              </p>
            )}
            {pills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pills.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] font-medium bg-black/5 text-muted-foreground px-2 py-0.5 rounded-full"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: details button + toggle */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {/* Details button */}
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              title="Plugin details"
            >
              <InfoIcon className="size-3.5" />
              Details
            </button>

            {/* Toggle */}
            {canToggle && (
              isDisabled ? (
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggleClick(true)}
                  className="rounded-full bg-primary px-5 py-[6px] text-[12px] font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isToggling ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    "Enable"
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked
                  disabled={isToggling}
                  onClick={() => handleToggleClick(false)}
                  className="relative inline-flex h-[26px] w-[44px] cursor-pointer items-center rounded-full bg-primary transition-colors disabled:opacity-50"
                  title="Disable"
                >
                  {isToggling ? (
                    <Loader2Icon className="size-3.5 animate-spin absolute left-1/2 -translate-x-1/2 text-white" />
                  ) : (
                    <span className="inline-block size-[22px] translate-x-[20px] rounded-full bg-white shadow-sm transition-transform" />
                  )}
                </button>
              )
            )}
          </div>
        </div>

        {/* Footer: toggle error OR real plugin error only */}
        {(toggleErrMsg || hasRealError) && (
          <div className="mt-3 flex flex-col gap-1">
            {toggleErrMsg && (
              <p className="text-[11px] text-red-500">{toggleErrMsg}</p>
            )}
            {hasRealError && plugin.error && (
              <p className="text-[11px] text-red-400 font-mono line-clamp-1">{plugin.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <PluginDetailDialog
        plugin={plugin}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Enable/disable confirm dialog */}
      <PluginToggleConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pluginName={plugin.name}
        enabling={pendingEnable}
        onConfirm={handleConfirm}
      />
    </>
  );
}
