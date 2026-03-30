import { Loader2Icon, PackagePlusIcon, ExternalLinkIcon } from "lucide-react";
import type { ChannelCatalogEntry } from "@/types/channels";

export function CatalogCard({ entry, onEnablePlugin, enablingPluginId }: {
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
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full shrink-0 mt-0.5 bg-[#D1D5DB]" />
          <div>
            <p className="text-sm font-semibold text-[#111827] leading-tight">{entry.label}</p>
            {entry.detailLabel && (
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">{entry.detailLabel}</p>
            )}
          </div>
        </div>
        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Docs <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>

      {entry.blurb && (
        <p className="text-[12px] text-[#6B7280] leading-relaxed">{entry.blurb}</p>
      )}

      {isPluginDisabled ? (
        <div className="mt-auto pt-1 flex flex-col gap-2">
          {/* <p className="text-[11px] text-amber-600">
            Channel installed but not enabled.
          </p> */}
          <button
            type="button"
            disabled={isEnabling || !entry.pluginId}
            onClick={(e) => { e.stopPropagation(); entry.pluginId && onEnablePlugin?.(entry.pluginId); }}
            className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isEnabling ? <Loader2Icon className="size-3 animate-spin" /> : <PackagePlusIcon className="size-3" />}
            {isEnabling ? "Enabling\u2026" : "Enable"}
          </button>
          {/* <p className="text-[10px] text-muted-foreground">
            Gateway restart required after enabling.
          </p> */}
        </div>
      ) : entry.npmSpec ? (
        <div className="mt-auto pt-1 flex items-center gap-1.5">
          <PackagePlusIcon className="size-3.5 text-[#9CA3AF]" />
          <code className="text-[11px] text-[#6B7280] font-mono">
            npm install -g {entry.npmSpec}
          </code>
        </div>
      ) : null}
    </div>
  );
}
