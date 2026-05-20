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
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="w-28 shrink-0 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-[12px] font-mono text-foreground break-all">{value}</span>
    </div>
  );
}

function TagPill({ label }: { label: string }) {
  return (
    <span className="inline-block text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{title}</p>
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
    ...(plugin.gatewayMethods ?? []).map((m) => `rpc: ${m}`),
    ...plugin.providerIds.map((p) => `provider: ${p}`),
    ...(plugin.hookCount > 0
      ? [`${plugin.hookCount} hook${plugin.hookCount !== 1 ? "s" : ""}`]
      : []),
    ...(plugin.httpRoutes > 0
      ? [`${plugin.httpRoutes} HTTP route${plugin.httpRoutes !== 1 ? "s" : ""}`]
      : []),
  ];

  const originStyles: Record<string, string> = {
    bundled: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300",
    global: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
    workspace: "bg-green-500/15 text-green-800 dark:text-green-300",
    config: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border border-border p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-7 pt-7 pb-5 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex size-[48px] shrink-0 items-center justify-center rounded-2xl bg-primary/5">
              <PackageIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[17px] font-bold text-foreground leading-snug">
                {plugin.name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {plugin.version && (
                  <span className="text-[11px] text-muted-foreground font-mono">v{plugin.version}</span>
                )}
                <span
                  className={cn(
                    "inline-block text-[9px] font-bold px-2 py-[2px] rounded-md uppercase tracking-wide",
                    originStyles[plugin.origin] ?? "bg-muted text-muted-foreground",
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
            <div className="rounded-2xl bg-muted/80 border border-border px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">{disabledReason}</p>
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
            <div className="rounded-2xl bg-muted/50 border border-border px-4 py-1">
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
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3">
                <p className="text-[11px] font-mono text-destructive break-all">{plugin.error}</p>
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-7 py-5 border-t border-border flex flex-row items-center justify-between gap-3">
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
            className="rounded-full bg-secondary px-5 py-[7px] text-[12px] font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
