import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  channelSetupShowsGuide,
  resolveChannelSetupSteps,
} from "@/lib/channel-setup";
import {
  resolveChannelLifecycle,
  type ChannelLifecycle,
} from "@/lib/channel-lifecycle";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";
import { ChannelSetupGuide } from "@/components/channels/ChannelSetupGuide";
import { ChannelStatusList } from "@/components/channels/shared/ChannelStatusList";
import type { StatusItem } from "@/components/channels/shared/ChannelStatusList";

export function ChannelDetailLayout({
  channelId,
  snapshot,
  catalogEntry,
  statusItems,
  primary,
  secondary,
}: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  catalogEntry?: ChannelCatalogEntry;
  statusItems: StatusItem[];
  /** Login / config — shown first during setup. */
  primary: ReactNode;
  /** Accounts, extra panels — after primary. */
  secondary?: ReactNode;
}) {
  const lifecycle = resolveChannelLifecycle({
    channelId,
    snapshot,
    catalogEntry,
  });
  const showGuide = channelSetupShowsGuide(lifecycle);
  const setupSteps = showGuide
    ? resolveChannelSetupSteps({ channelId, snapshot, lifecycle })
    : [];
  const docsUrl = catalogEntry?.docsPath
    ? `https://docs.openclaw.ai${catalogEntry.docsPath}`
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      {showGuide && <ChannelSetupGuide steps={setupSteps} docsUrl={docsUrl} />}
      {primary}
      {secondary}
      <ChannelTechnicalStatus
        lifecycle={lifecycle}
        statusItems={statusItems}
        defaultOpen={lifecycle === "error"}
      />
    </div>
  );
}

function ChannelTechnicalStatus({
  lifecycle,
  statusItems,
  defaultOpen,
}: {
  lifecycle: ChannelLifecycle;
  statusItems: StatusItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  if (statusItems.length === 0) {
    return null;
  }

  const hideByDefault =
    lifecycle === "needs_setup" || lifecycle === "configured" || lifecycle === "running";

  if (!hideByDefault) {
    return <ChannelStatusList items={statusItems} />;
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        Technical status
        <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3">
          <ChannelStatusList items={statusItems} />
        </div>
      )}
    </div>
  );
}
