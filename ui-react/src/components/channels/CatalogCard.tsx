import {
  DownloadIcon,
  Loader2Icon,
  PackagePlusIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
} from "lucide-react";
import {
  catalogEntryNeedsInstall,
  isDiscoverLifecycle,
  resolveChannelLifecycle,
} from "@/lib/channel-lifecycle";
import type { ChannelCatalogEntry } from "@/types/channels";
import { ChannelLifecycleBadge } from "@/components/channels/ChannelLifecycleBadge";
import { getChannelLogoUrl } from "./shared/channel-logos";

export function CatalogCard({
  entry,
  onEnablePlugin,
  onEnableChannel,
  onInstall,
  onOpen,
  enablingPluginId,
  enablingChannelId,
  installingSpec,
}: {
  entry: ChannelCatalogEntry;
  onEnablePlugin?: (pluginId: string) => void;
  onEnableChannel?: (channelId: string) => void;
  onInstall?: (channelId: string, npmSpec: string) => void;
  onOpen?: (channelId: string) => void;
  enablingPluginId?: string | null;
  enablingChannelId?: string | null;
  installingSpec?: string | null;
}) {
  const docsUrl = entry.docsPath
    ? `https://docs.openclaw.ai${entry.docsPath}`
    : undefined;

  const lifecycle = resolveChannelLifecycle({
    channelId: entry.id,
    snapshot: null,
    catalogEntry: entry,
  });
  const needsInstall = catalogEntryNeedsInstall(entry);
  const isPluginDisabled = lifecycle === "plugin_disabled";
  const isNotLoaded = lifecycle === "not_loaded";
  const isEnablingPlugin = isPluginDisabled && enablingPluginId === entry.pluginId;
  const isEnablingChannel = isNotLoaded && !needsInstall && enablingChannelId === entry.id;
  const isInstalling = needsInstall && installingSpec === entry.npmSpec;
  const isBusy = isEnablingPlugin || isEnablingChannel || isInstalling;
  const canActivate = isDiscoverLifecycle(lifecycle);

  const handlePrimaryAction = () => {
    if (!canActivate) {
      onOpen?.(entry.id);
      return;
    }
    if (needsInstall && entry.npmSpec) {
      onInstall?.(entry.id, entry.npmSpec);
      return;
    }
    if (isPluginDisabled && entry.pluginId) {
      onEnablePlugin?.(entry.pluginId);
      return;
    }
    onEnableChannel?.(entry.id);
  };

  const primaryLabel = needsInstall
    ? isInstalling
      ? "Installing…"
      : "Install"
    : isBusy
      ? "Enabling…"
      : "Enable";

  const showLifecycleBadge = !canActivate;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePrimaryAction}
      onKeyDown={(e) => e.key === "Enter" && handlePrimaryAction()}
      className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 text-card-foreground cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 mt-0.5">
            {(() => {
              const logoUrl = getChannelLogoUrl(entry.id);
              if (logoUrl) {
                return (
                  <img
                    src={logoUrl}
                    alt={entry.label}
                    className="size-12 object-contain"
                    loading="lazy"
                  />
                );
              }
              return <MessageSquareIcon className="size-12 text-muted-foreground" />;
            })()}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold leading-tight">{entry.label}</p>
              {showLifecycleBadge && <ChannelLifecycleBadge lifecycle={lifecycle} />}
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {entry.blurb ?? entry.label}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Docs <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {canActivate && (
            <button
              type="button"
              disabled={
                isBusy ||
                (needsInstall ? !entry.npmSpec || !onInstall : isPluginDisabled ? !entry.pluginId : !onEnableChannel)
              }
              onClick={(e) => {
                e.stopPropagation();
                handlePrimaryAction();
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isBusy ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : needsInstall ? (
                <DownloadIcon className="size-3" />
              ) : (
                <PackagePlusIcon className="size-3" />
              )}
              {primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
