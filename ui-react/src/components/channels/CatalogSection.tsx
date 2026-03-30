import { Loader2Icon } from "lucide-react";
import type { ChannelCatalogEntry } from "@/types/channels";
import { CatalogCard } from "@/components/channels/CatalogCard";
import { ErrorCallout } from "@/components/channels/shared/ErrorCallout";

/**
 * Renders the "Installed — needs enabling" and "Not installed" catalog groups.
 * Used in both the All tab and the Disabled tab of ChannelsPage.
 */
export function CatalogSection({
  pluginDisabledEntries,
  notInstalledEntries,
  onEnablePlugin,
  enablingPluginId,
  catalogLoading,
  catalogError,
}: {
  pluginDisabledEntries: ChannelCatalogEntry[];
  notInstalledEntries: ChannelCatalogEntry[];
  onEnablePlugin: (pluginId: string) => void;
  enablingPluginId?: string | null;
  catalogLoading?: boolean;
  catalogError?: string | null;
}) {
  if (catalogLoading && pluginDisabledEntries.length === 0 && notInstalledEntries.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" /> Loading catalog…
      </div>
    );
  }

  if (catalogError) {
    return <ErrorCallout message={catalogError} />;
  }

  if (pluginDisabledEntries.length === 0 && notInstalledEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {pluginDisabledEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">
            Installed — needs enabling
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pluginDisabledEntries.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                onEnablePlugin={onEnablePlugin}
                enablingPluginId={enablingPluginId}
              />
            ))}
          </div>
        </div>
      )}
      {notInstalledEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">
            Not installed
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notInstalledEntries.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                onEnablePlugin={onEnablePlugin}
                enablingPluginId={enablingPluginId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
