import { ExternalLinkIcon, PackageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PluginRecord } from "@/types/plugins";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#F3F4F6] last:border-0">
      <span className="w-28 shrink-0 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-[12px] font-mono text-[#374151] break-all">{value}</span>
    </div>
  );
}

function TagPill({ label }: { label: string }) {
  return (
    <span className="inline-block text-[10px] font-medium bg-black/5 text-muted-foreground px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

export function PluginDetailDialog({
  plugin,
  open,
  onOpenChange,
}: {
  plugin: PluginRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!plugin) return null;

  const docsUrl = (plugin as unknown as Record<string, unknown>).docsUrl as string | undefined;

  // plugin.error on a disabled plugin is the disable reason (e.g. "bundled (disabled by default)")
  // — not a real load error. Only show error section when status === "error".
  const hasRealError = plugin.status === "error";
  const disabledReason =
    !hasRealError && plugin.status === "disabled" && plugin.error ? plugin.error : null;

  const capabilities = [
    ...plugin.toolNames.map((t) => `tool: ${t}`),
    ...plugin.services.map((s) => `service: ${s}`),
    ...plugin.cliCommands.map((c) => `cli: ${c}`),
    ...plugin.gatewayMethods.map((m) => `rpc: ${m}`),
    ...plugin.providerIds.map((p) => `provider: ${p}`),
    ...(plugin.hookCount > 0
      ? [`${plugin.hookCount} hook${plugin.hookCount !== 1 ? "s" : ""}`]
      : []),
    ...(plugin.httpRoutes > 0
      ? [`${plugin.httpRoutes} HTTP route${plugin.httpRoutes !== 1 ? "s" : ""}`]
      : []),
  ];

  const originColors: Record<string, string> = {
    bundled: "bg-[#EEF2FF] text-[#4F46E5]",
    global: "bg-[#FFF7ED] text-[#C2410C]",
    workspace: "bg-[#F0FDF4] text-[#166534]",
    config: "bg-[#FFF1F2] text-[#BE123C]",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-black/[0.08] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-7 pt-7 pb-5 border-b border-[#F3F4F6]">
          <div className="flex items-center gap-4">
            <div className="flex size-[48px] shrink-0 items-center justify-center rounded-2xl bg-primary/5">
              <PackageIcon className="size-5 text-[#8E8E93]" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[17px] font-bold text-[#1A1C1D] leading-snug">
                {plugin.name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {plugin.version && (
                  <span className="text-[11px] text-[#8E8E93] font-mono">v{plugin.version}</span>
                )}
                <span
                  className={cn(
                    "inline-block text-[9px] font-bold px-2 py-[2px] rounded-md uppercase tracking-wide",
                    originColors[plugin.origin] ?? "bg-[#F2F2F7] text-[#8E8E93]",
                  )}
                >
                  {plugin.origin}
                </span>
              </div>
            </div>
          </div>
          {plugin.description && (
            <p className="text-[13px] text-muted-foreground leading-[1.6] mt-2">
              {plugin.description}
            </p>
          )}
        </DialogHeader>

        {/* Body */}
        <div className="px-7 py-5 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
          {/* Disabled reason — neutral info, not an error */}
          {disabledReason && (
            <div className="rounded-2xl bg-[#F2F2F7] border border-[#E5E5EA] px-4 py-3">
              <p className="text-[11px] text-[#8E8E93] font-medium">{disabledReason}</p>
            </div>
          )}

          {/* Capabilities */}
          {capabilities.length > 0 && (
            <Section title="Capabilities">
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((c) => (
                  <TagPill key={c} label={c} />
                ))}
              </div>
            </Section>
          )}

          {/* Technical info */}
          <Section title="Details">
            <div className="rounded-2xl bg-[#FAFAFA] border border-[#F3F4F6] px-4 py-1">
              <InfoRow label="ID" value={plugin.id} />
              <InfoRow label="Status" value={plugin.status} />
              <InfoRow label="Source" value={plugin.source} />
              {plugin.workspaceDir && (
                <InfoRow label="Workspace" value={plugin.workspaceDir} />
              )}
              {plugin.kind && <InfoRow label="Kind" value={plugin.kind} />}
            </div>
          </Section>

          {/* Real error only (status === "error") */}
          {hasRealError && plugin.error && (
            <Section title="Error">
              <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                <p className="text-[11px] font-mono text-red-600 break-all">{plugin.error}</p>
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-7 py-5 border-t border-[#F3F4F6] flex flex-row items-center justify-between gap-3">
          {docsUrl ? (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
            >
              <ExternalLinkIcon className="size-3.5" />
              Documentation
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full bg-[#F2F2F7] px-5 py-[7px] text-[12px] font-semibold text-[#1A1C1D] hover:bg-[#E5E5EA] transition-colors"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
