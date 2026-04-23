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
    <div className={cn("mt-4 rounded-lg border bg-muted/30 p-3 space-y-1.5", className)}>
      {items.map((item, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(120px,1fr)_auto] items-center gap-3 text-sm"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span
            className={cn(
              "min-w-[64px] text-right font-mono text-xs",
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
