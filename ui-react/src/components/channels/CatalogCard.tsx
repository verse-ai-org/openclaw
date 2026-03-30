import { Loader2Icon, PackagePlusIcon, ExternalLinkIcon, MessageSquareIcon } from "lucide-react";
import type { ChannelCatalogEntry } from "@/types/channels";
import { getChannelLogoUrl } from "./shared/channel-logos";

export function CatalogCard({
  entry,
  onEnablePlugin,
  enablingPluginId,
}: {
  entry: ChannelCatalogEntry;
  onEnablePlugin?: (pluginId: string) => void;
  enablingPluginId?: string | null;
}) {
  const docsUrl = entry.docsPath
    ? `https://docs.openclaw.ai${entry.docsPath}`
    : undefined;

  const isPluginDisabled = entry.installed && entry.pluginEnabled === false;
  const isEnabling = isPluginDisabled && enablingPluginId === entry.pluginId;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Channel Logo */}
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
              // Fallback to default icon if no logo
              return <MessageSquareIcon className="size-12 text-zinc-400" />;
            })()}
          </div>
          <div className="flex flex-col h-full">
            <p className="text-sm font-semibold text-[#111827] leading-tight">
              {entry.label}
            </p>
            <p className="text-[12px] text-[#6B7280] leading-relaxed">
              {entry.blurb ?? entry.label}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-zinc-500 font-semibold hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Docs <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {isPluginDisabled && (
            <button
              type="button"
              disabled={isEnabling || !entry.pluginId}
              onClick={(e) => {
                e.stopPropagation();
                if (entry.pluginId) {
                  onEnablePlugin?.(entry.pluginId);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isEnabling ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <PackagePlusIcon className="size-3" />
              )}
              {isEnabling ? "Enabling\u2026" : "Enable"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
