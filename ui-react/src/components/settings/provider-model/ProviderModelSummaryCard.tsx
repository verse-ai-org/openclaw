import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { providerEmoji, providerLogo } from "@/store/provider-catalog.store";
import { cn } from "@/lib/utils";

interface ProviderModelSummaryCardProps {
  providerId: string;
  providerLabel: string;
  methodLabel: string;
  methodStatusLabel: string;
  methodStatusTone: "success" | "warning" | "neutral";
  modelId: string;
  modelOptions: string[];
  onModelChange: (modelId: string) => void;
  onEdit: () => void;
}

export function ProviderModelSummaryCard({
  providerId,
  providerLabel,
  methodLabel,
  methodStatusLabel,
  methodStatusTone,
  modelId,
  modelOptions,
  onModelChange,
  onEdit,
}: ProviderModelSummaryCardProps) {
  return (
    <div className="p-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-muted-foreground">Current configuration</p>
        </div>
        <Button type="button" size="sm" onClick={onEdit} className="rounded-full">
          Edit Provider & Auth
        </Button>
      </div>

      <div className="grid gap-2 bg-muted/20 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <div className="rounded-md px-3 py-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Provider
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center overflow-hidden rounded-md bg-muted text-sm">
              {providerLogo(providerId) ? (
                <img
                  src={providerLogo(providerId)}
                  alt={`${providerLabel} logo`}
                  className="size-5 object-contain"
                />
              ) : (
                providerEmoji(providerId) || "🤖"
              )}
            </span>
            <p className="text-sm font-medium text-foreground">{providerLabel}</p>
          </div>
        </div>
        <div className="rounded-md px-3 py-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Auth Method
          </p>
          <p className="mb-1 text-sm font-medium text-foreground">{methodLabel}</p>
          <Badge
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
              methodStatusTone === "success" &&
                "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
              methodStatusTone === "warning" &&
                "bg-amber-500/15 text-amber-800 dark:text-amber-200",
              methodStatusTone === "neutral" && "bg-muted text-muted-foreground",
            )}
          >
            {methodStatusLabel}
          </Badge>
        </div>
        <div className="rounded-md px-3 py-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Default Model
          </p>
          {modelOptions.length > 0 ? (
            <Select value={modelId || undefined} onValueChange={onModelChange}>
              <SelectTrigger className="h-8 w-full font-mono text-[12px]">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model} className="font-mono text-[12px]">
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="truncate font-mono text-[12px] text-foreground">
              {modelId || "Not set"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
