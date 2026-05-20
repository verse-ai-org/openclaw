import { Button } from "@/components/ui/button";

export function ChannelTabEmptyState({
  variant,
  onShowAll,
  onRefresh,
}: {
  variant: "active" | "disabled" | "all";
  onShowAll?: () => void;
  onRefresh?: () => void;
}) {
  const copy =
    variant === "active"
      ? {
          title: "No active channels",
          body: "Enable a channel from All or Disabled, then complete setup in the detail view.",
        }
      : variant === "disabled"
        ? {
            title: "Nothing disabled or waiting",
            body: "Channels you turn off in config, or plugins not yet enabled, appear here.",
          }
        : {
            title: "No channels available",
            body: "Refresh to reload the catalog, or check that the gateway has channel plugins installed.",
          };

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap gap-2">
        {variant !== "all" && onShowAll && (
          <Button size="sm" variant="outline" onClick={onShowAll}>
            Show all
          </Button>
        )}
        {onRefresh && (
          <Button size="sm" variant="ghost" onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
}
