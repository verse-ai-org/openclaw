import { Loader2Icon } from "lucide-react";
import type { ChannelCatalogEntry } from "@/types/channels";
import { CatalogCard } from "@/components/channels/CatalogCard";
import { ErrorCallout } from "@/components/channels/shared/ErrorCallout";

/**
 * Renders discover catalog groups: plugin disabled, install required, enable-only.
 */
export function CatalogSection({
  pluginDisabledEntries,
  installRequiredEntries,
  enableOnlyEntries,
  onEnablePlugin,
  onEnableChannel,
  onInstall,
  onOpen,
  enablingPluginId,
  enablingChannelId,
  installingSpec,
  catalogLoading,
  catalogError,
}: {
  pluginDisabledEntries: ChannelCatalogEntry[];
  installRequiredEntries: ChannelCatalogEntry[];
  enableOnlyEntries: ChannelCatalogEntry[];
  onEnablePlugin: (pluginId: string) => void;
  onEnableChannel: (channelId: string) => void;
  onInstall: (channelId: string, npmSpec: string) => void;
  onOpen?: (channelId: string) => void;
  enablingPluginId?: string | null;
  enablingChannelId?: string | null;
  installingSpec?: string | null;
  catalogLoading?: boolean;
  catalogError?: string | null;
}) {
  const notInstalledEntries = [...installRequiredEntries, ...enableOnlyEntries];
  const hasEntries =
    pluginDisabledEntries.length > 0 || notInstalledEntries.length > 0;

  if (catalogLoading && !hasEntries) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" /> Loading catalog…
      </div>
    );
  }

  if (catalogError) {
    return <ErrorCallout message={catalogError} />;
  }

  if (!hasEntries) {
    return null;
  }

  const renderGrid = (entries: ChannelCatalogEntry[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {entries.map((entry) => (
        <CatalogCard
          key={entry.id}
          entry={entry}
          onEnablePlugin={onEnablePlugin}
          onEnableChannel={onEnableChannel}
          onInstall={onInstall}
          onOpen={onOpen}
          enablingPluginId={enablingPluginId}
          enablingChannelId={enablingChannelId}
          installingSpec={installingSpec}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {pluginDisabledEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
            Installed — needs enabling
          </p>
          {renderGrid(pluginDisabledEntries)}
        </div>
      )}
      {installRequiredEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
            Not installed — install required
          </p>
          {renderGrid(installRequiredEntries)}
        </div>
      )}
      {enableOnlyEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
            Not installed — enable to load
          </p>
          {renderGrid(enableOnlyEntries)}
        </div>
      )}
    </div>
  );
}
