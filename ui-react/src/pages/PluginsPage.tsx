import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, PackageIcon } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import { usePluginsStore } from "@/store/plugins.store";
import { PluginCard } from "@/components/plugins/PluginCard";

export function PluginsPage() {
  const [filter, setFilter] = useState<"all" | "loaded" | "not-loaded">("all");
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const allPlugins = usePluginsStore((s) => s.plugins);
  // Channel plugins are managed entirely from the Channels page.
  const plugins = allPlugins.filter((p) => p.channelIds.length === 0);
  const loadedPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.status === "loaded"),
    [plugins],
  );
  const notLoadedPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.status !== "loaded"),
    [plugins],
  );
  const filteredPlugins = useMemo(() => {
    if (filter === "loaded") {
      return loadedPlugins;
    }
    if (filter === "not-loaded") {
      return notLoadedPlugins;
    }
    return plugins;
  }, [filter, loadedPlugins, notLoadedPlugins, plugins]);
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
    <div className="flex flex-col gap-12 px-12 p-8 max-w-4xl mx-auto w-full">
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
      </div>

      {/* Content */}
      <div className="flex flex-col gap-6">
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

        {plugins.length > 0 && (
          <SegmentedControl
            options={[
              { value: "all", label: `All (${plugins.length})` },
              { value: "loaded", label: `Loaded (${loadedPlugins.length})` },
              {
                value: "not-loaded",
                label: `Not loaded (${notLoadedPlugins.length})`,
              },
            ]}
            value={filter}
            onChange={setFilter}
            size="sm"
            className="w-fit"
          />
        )}

        {plugins.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex size-16 items-center justify-center rounded-3xl bg-[#F6F6F6] mb-4">
              <PackageIcon className="size-7 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-medium text-[#8E8E93]">No plugins loaded.</p>
          </div>
        )}

        {plugins.length > 0 && filteredPlugins.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex size-16 items-center justify-center rounded-3xl bg-[#F6F6F6] mb-4">
              <PackageIcon className="size-7 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-medium text-[#8E8E93]">
              {filter === "loaded"
                ? "No loaded plugins."
                : "No not-loaded plugins."}
            </p>
          </div>
        )}

        {filteredPlugins.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPlugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
