import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { AuthProviderGroupDef } from "@/data/auth-choice-groups";
import {
  providerEmoji,
  providerLogo,
  useProviderGroups,
} from "@/store/provider-catalog.store";

interface ProviderPickerProps {
  selectedProviderId: string | null;
  onSelect: (group: AuthProviderGroupDef) => void;
}

export function ProviderPicker({
  selectedProviderId,
  onSelect,
}: ProviderPickerProps) {
  const [search, setSearch] = useState("");
  const allGroups = useProviderGroups();
  const providers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return allGroups;
    }
    return allGroups.filter(
      (group) =>
        group.label.toLowerCase().includes(term) ||
        group.id.toLowerCase().includes(term) ||
        group.hint?.toLowerCase().includes(term),
    );
  }, [search, allGroups]);

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search provider..."
        // className="h-10"
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
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-md bg-muted text-base">
                  {providerLogo(group.id) ? (
                    <img
                      src={providerLogo(group.id)}
                      alt={`${group.label} logo`}
                      className="size-6 object-contain"
                    />
                  ) : (
                    <span>{providerEmoji(group.id) || "🤖"}</span>
                  )}
                </span>
                <p className="truncate text-sm font-semibold text-foreground">{group.label}</p>
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
