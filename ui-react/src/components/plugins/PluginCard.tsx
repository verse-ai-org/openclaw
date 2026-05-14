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
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">
        <CheckCircle2Icon className="size-3" /> loaded
      </span>
    );
  }
  if (status === "disabled") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
        disabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
      <XCircleIcon className="size-3" /> error
    </span>
  );
}

function OriginPill({ origin }: { origin: string }) {
  const styles: Record<string, string> = {
    bundled: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300",
    global: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
    workspace: "bg-green-500/15 text-green-800 dark:text-green-300",
    config: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  };
  return (
    <span
      className={cn(
        "inline-block text-[9px] font-bold px-2 py-[2px] rounded-md uppercase tracking-wide",
        styles[origin] ?? "bg-muted text-muted-foreground",
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
          "flex flex-col rounded-xl border border-border bg-card p-8 transition-colors text-card-foreground",
          isDisabled && "opacity-60",
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
                  isDisabled ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {plugin.name}
              </span>
              {plugin.version && (
                <span className="text-[11px] text-muted-foreground font-mono shrink-0">
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
                    className="text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
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
                  className="rounded-full bg-primary px-5 py-[6px] text-[12px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isToggling ? (
                    <Loader2Icon className="size-3.5 animate-spin text-primary-foreground" />
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
                    <Loader2Icon className="size-3.5 animate-spin absolute left-1/2 -translate-x-1/2 text-primary-foreground" />
                  ) : (
                    <span className="inline-block size-[22px] translate-x-[20px] rounded-full bg-primary-foreground shadow-sm transition-transform" />
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
              <p className="text-[11px] text-destructive">{toggleErrMsg}</p>
            )}
            {hasRealError && plugin.error && (
              <p className="text-[11px] text-destructive font-mono line-clamp-1">{plugin.error}</p>
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
