import { CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { AuthProviderGroupDef } from "@/data/auth-choice-groups";
import { AUTH_PROVIDER_GROUPS } from "@/data/auth-choice-groups";
import { PROVIDER_EMOJI } from "./provider-constants";

interface ProviderSearchDialogProps {
  selectedProviderId: string | null;
  onSelect: (group: AuthProviderGroupDef) => void;
}

export function ProviderSearchDialog({
  selectedProviderId,
  onSelect,
}: ProviderSearchDialogProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return AUTH_PROVIDER_GROUPS;
    }
    return AUTH_PROVIDER_GROUPS.filter(
      (g) =>
        g.label.toLowerCase().includes(term) ||
        g.id.toLowerCase().includes(term) ||
        g.hint?.toLowerCase().includes(term),
    );
  }, [search]);

  return (
    <div className="flex flex-col gap-4 py-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search providers..."
        className="h-9"
      />
      <div className="max-h-[50vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filtered.map((group) => {
            const selected = selectedProviderId === group.id;
            return (
              <button
                type="button"
                key={group.id}
                onClick={() => onSelect(group)}
                className={[
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/50",
                ].join(" ")}
              >
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted text-base">
                  {PROVIDER_EMOJI[group.id] ?? "🤖"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {group.label}
                  </span>
                  {group.hint ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {group.hint}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <CheckIcon className="size-4 text-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
