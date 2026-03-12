import { tabLabel } from "@/lib/tabs";
import { tabIcon } from "@/lib/tabs";
import type { Tab } from "@/types/gateway";

interface PlaceholderPageProps {
  tab: Tab;
}

export function PlaceholderPage({ tab }: PlaceholderPageProps) {
  const Icon = tabIcon(tab);
  const label = tabLabel(tab);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <Icon className="size-12 opacity-20" />
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">{label}</p>
        <p className="text-sm">Coming soon</p>
        <p className="text-sm">This page will be implemented in a future phase.</p>
      </div>
    </div>
  );
}
