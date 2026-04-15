import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { AuthProviderGroupDef } from "@/data/auth-choice-groups";
import { AUTH_PROVIDER_GROUPS } from "@/data/auth-choice-groups";

interface ProviderPickerProps {
  selectedProviderId: string | null;
  onSelect: (group: AuthProviderGroupDef) => void;
}

export function ProviderPicker({
  selectedProviderId,
  onSelect,
}: ProviderPickerProps) {
  const [search, setSearch] = useState("");
  const providers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = AUTH_PROVIDER_GROUPS;
    if (!term) {
      return all;
    }
    return all.filter(
      (group) =>
        group.label.toLowerCase().includes(term) ||
        group.id.toLowerCase().includes(term) ||
        group.hint?.toLowerCase().includes(term),
    );
  }, [search]);

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search provider..."
        className="h-8"
      />
      <div className="max-h-[42vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {providers.map((group) => {
          const selected = selectedProviderId === group.id;
          return (
            <button
              type="button"
              key={group.id}
              onClick={() => onSelect(group)}
              className={[
                "rounded-lg border px-3 py-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/50",
              ].join(" ")}
            >
              <p className="text-sm text-foreground font-semibold">{group.label}</p>
              {group.hint ? (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {group.hint}
                </p>
              ) : null}
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
