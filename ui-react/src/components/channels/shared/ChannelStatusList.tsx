import { cn } from "@/lib/utils";

export type StatusItem = {
  label: string;
  value: React.ReactNode;
  danger?: boolean;
};

export function ChannelStatusList({
  items,
  className,
}: {
  items: StatusItem[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5 mt-4", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-start justify-between gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">{item.label}</span>
          <span
            className={cn(
              "text-right font-mono text-xs break-all",
              item.danger && "text-destructive",
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
