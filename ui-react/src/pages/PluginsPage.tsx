import { useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  DownloadIcon,
  Loader2Icon,
  PackageIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import { usePluginsStore } from "@/store/plugins.store";
import type { PluginRecord } from "@/types/plugins";

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

function PluginCard({ plugin }: { plugin: PluginRecord }) {
  const togglingPluginId = usePluginsStore((s) => s.togglingPluginId);
  const toggleError = usePluginsStore((s) => s.toggleError);
  const enablePlugin = usePluginsStore((s) => s.enablePlugin);
  const [expanded, setExpanded] = useState(false);

  const isToggling = togglingPluginId === plugin.id;
  const errMsg = toggleError[plugin.id];
  const canToggle = plugin.status !== "error" || !plugin.enabled;
  const isDisabled = !plugin.enabled;

  const pills = [
    plugin.toolNames.length > 0 ? `${plugin.toolNames.length} tool${plugin.toolNames.length !== 1 ? "s" : ""}` : null,
    plugin.channelIds.length > 0 ? `${plugin.channelIds.length} channel${plugin.channelIds.length !== 1 ? "s" : ""}` : null,
    plugin.services.length > 0 ? `${plugin.services.length} service${plugin.services.length !== 1 ? "s" : ""}` : null,
    plugin.hookCount > 0 ? `${plugin.hookCount} hook${plugin.hookCount !== 1 ? "s" : ""}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl border p-8 transition-colors",
        isDisabled ? "bg-[#FBFBFB] border-black/[0.06]" : "bg-white border-black/[0.08]",
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div
          className={cn(
            "relative flex size-[52px] shrink-0 items-center justify-center rounded-2xl text-xl",
            isDisabled ? "bg-[#F0F0F0]" : "bg-primary/5",
          )}
        >
          <PackageIcon className={cn("size-5 text-[#8E8E93]", isDisabled && "opacity-30")} />
        </div>

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
              <span className="text-[11px] text-[#8E8E93] font-mono shrink-0">v{plugin.version}</span>
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
                <span key={p} className="text-[10px] font-medium bg-black/5 text-muted-foreground px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          )}
        </div>

        {/* Right: toggle */}
        {canToggle && (
          <div className="flex shrink-0 flex-col items-center gap-1">
            {isDisabled ? (
              /* Enable button — matches SkillCard's Enable style */
              <button
                type="button"
                disabled={isToggling}
                onClick={() => void enablePlugin(plugin.id, true)}
                className="rounded-full bg-primary px-5 py-[6px] text-[12px] font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isToggling ? <Loader2Icon className="size-3.5 animate-spin" /> : "Enable"}
              </button>
            ) : (
              /* iOS toggle — matches SkillCard's enabled toggle */
              <button
                type="button"
                role="switch"
                aria-checked
                disabled={isToggling}
                onClick={() => void enablePlugin(plugin.id, false)}
                className="relative inline-flex h-[26px] w-[44px] cursor-pointer items-center rounded-full bg-primary transition-colors disabled:opacity-50"
                title="Disable"
              >
                {isToggling ? (
                  <Loader2Icon className="size-3.5 animate-spin absolute left-1/2 -translate-x-1/2 text-white" />
                ) : (
                  <span className="inline-block size-[22px] translate-x-[20px] rounded-full bg-white shadow-sm transition-transform" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error / detail footer */}
      {(errMsg ?? plugin.error ?? true) && (
        <div className="mt-3 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            {errMsg && <p className="text-[11px] text-red-500">{errMsg}</p>}
            {plugin.error && <p className="text-[11px] text-red-400 font-mono line-clamp-1">{plugin.error}</p>}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-3 flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
            <ChevronDownIcon className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 rounded-2xl bg-[#FAFAFA] border border-[#F3F4F6] px-4 py-3 text-[11px] text-[#6B7280] font-mono space-y-0.5">
          <div><span className="text-[#8E8E93]">id:</span> {plugin.id}</div>
          <div><span className="text-[#8E8E93]">source:</span> {plugin.source}</div>
          {plugin.workspaceDir && <div><span className="text-[#8E8E93]">workspace:</span> {plugin.workspaceDir}</div>}
          {plugin.toolNames.length > 0 && <div><span className="text-[#8E8E93]">tools:</span> {plugin.toolNames.join(", ")}</div>}
          {plugin.channelIds.length > 0 && <div><span className="text-[#8E8E93]">channels:</span> {plugin.channelIds.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

function InstallForm() {
  const installing = usePluginsStore((s) => s.installing);
  const installResult = usePluginsStore((s) => s.installResult);
  const installError = usePluginsStore((s) => s.installError);
  const installPlugin = usePluginsStore((s) => s.installPlugin);
  const clearInstallResult = usePluginsStore((s) => s.clearInstallResult);
  const [spec, setSpec] = useState("");

  const handleInstall = () => {
    if (!spec.trim()) return;
    void installPlugin(spec.trim());
    setSpec("");
  };

  return (
    <div className="rounded-3xl border border-black/[0.08] bg-white p-8">
      <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide mb-4">Install Plugin</p>
      <div className="flex gap-3">
        <input
          className="h-10 flex-1 rounded-[18px] bg-[#F6F6F6] px-4 text-[12px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="@openclaw/memory-cognee or ./path/to/plugin"
          value={spec}
          onChange={(e) => { clearInstallResult(); setSpec(e.target.value); }}
          onKeyDown={(e) => e.key === "Enter" && handleInstall()}
          disabled={installing}
        />
        <button
          type="button"
          disabled={installing || !spec.trim()}
          onClick={handleInstall}
          className="h-10 rounded-[18px] bg-black px-5 text-[12px] font-bold text-white hover:bg-black/80 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          {installing ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <DownloadIcon className="size-3.5" />
          )}
          {installing ? "Installing…" : "Install"}
        </button>
      </div>
      {installResult && (
        <div className={cn("mt-3 text-[12px] px-4 py-2.5 rounded-2xl", installResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
          {installResult.ok
            ? `Installed ${installResult.pluginId}${installResult.version ? ` v${installResult.version}` : ""}. Restart gateway to load.`
            : `Failed: ${installResult.error ?? "unknown error"}${installResult.code ? ` (${installResult.code})` : ""}`}
        </div>
      )}
      {installError && (
        <div className="mt-3 text-[12px] px-4 py-2.5 rounded-2xl bg-red-50 text-red-600">{installError}</div>
      )}
    </div>
  );
}

export function PluginsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const plugins = usePluginsStore((s) => s.plugins);
  const loading = usePluginsStore((s) => s.loading);
  const lastError = usePluginsStore((s) => s.lastError);
  const diagnostics = usePluginsStore((s) => s.diagnostics);
  const fetchPlugins = usePluginsStore((s) => s.fetchPlugins);

  useEffect(() => {
    if (isConnected) { void fetchPlugins(); }
  }, [isConnected, fetchPlugins]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Not connected to gateway.
      </div>
    );
  }

  if (loading && plugins.length === 0) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="text-sm">Loading plugins…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12 px-12 py-12 max-w-[1020px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
            Plugins
          </h2>
          <p className="text-lg font-medium text-muted-foreground">
            Installed and available plugins.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-9 mb-1 shrink-0"
          disabled={loading}
          onClick={() => void fetchPlugins()}
          title="Refresh"
        >
          <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-6">
        <InstallForm />

        {lastError && (
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {lastError}
          </div>
        )}

        {diagnostics.length > 0 && (
          <div className="flex flex-col gap-2">
            {diagnostics.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "text-[12px] px-4 py-2.5 rounded-2xl",
                  d.level === "error" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700",
                )}
              >
                {d.pluginId && <span className="font-semibold">{d.pluginId}: </span>}
                {d.message}
              </div>
            ))}
          </div>
        )}

        {plugins.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex size-16 items-center justify-center rounded-3xl bg-[#F6F6F6] mb-4">
              <PackageIcon className="size-7 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-medium text-[#8E8E93]">No plugins loaded.</p>
          </div>
        )}

        {plugins.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 
