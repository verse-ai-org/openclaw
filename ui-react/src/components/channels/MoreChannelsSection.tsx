import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { ChannelCatalogEntry } from "@/types/channels";
import { CatalogCard } from "@/components/channels/CatalogCard";

export function MoreChannelsSection({
  entries,
  onEnablePlugin,
  onEnableChannel,
  onInstall,
  onOpen,
  enablingPluginId,
  enablingChannelId,
  installingSpec,
}: {
  entries: ChannelCatalogEntry[];
  onEnablePlugin: (pluginId: string) => void;
  onEnableChannel: (channelId: string) => void;
  onInstall: (channelId: string, npmSpec: string) => void;
  onOpen?: (channelId: string) => void;
  enablingPluginId?: string | null;
  enablingChannelId?: string | null;
  installingSpec?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-fit"
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
        More channels ({entries.length})
      </button>
      {expanded && (
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
      )}
    </div>
  );
}
