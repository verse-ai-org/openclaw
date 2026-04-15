import type { AuthMethodDef } from "@/data/auth-choice-groups";

interface AuthMethodTabsProps {
  methods: AuthMethodDef[];
  selectedMethodId: string | null;
  onSelect: (method: AuthMethodDef) => void;
}

export function AuthMethodTabs({
  methods,
  selectedMethodId,
  onSelect,
}: AuthMethodTabsProps) {
  if (methods.length <= 1) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {methods.map((method) => {
        const selected = method.id === selectedMethodId;
        return (
          <button
            type="button"
            key={method.id}
            onClick={() => onSelect(method)}
            className={[
              "rounded-lg border px-3 py-2 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:bg-muted/50",
            ].join(" ")}
          >
            <p className="text-sm font-medium">{method.label}</p>
            <p className="text-xs text-muted-foreground">
              {method.type === "api-key"
                ? "API Key"
                : method.type === "oauth"
                  ? "OAuth"
                  : method.type === "proxy"
                    ? "Proxy"
                    : "Custom"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
