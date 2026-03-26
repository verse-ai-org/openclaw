import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NostrProfile, NostrProfileFormState } from "@/types/channels";

const BASIC_FIELDS: Array<{ key: keyof NostrProfile; label: string; placeholder?: string }> = [
  { key: "name", label: "Username", placeholder: "satoshi" },
  { key: "displayName", label: "Display Name", placeholder: "Satoshi N." },
  { key: "about", label: "About", placeholder: "Bitcoin creator" },
  { key: "picture", label: "Avatar URL", placeholder: "https://…" },
];

const ADVANCED_FIELDS: Array<{ key: keyof NostrProfile; label: string; placeholder?: string }> = [
  { key: "banner", label: "Banner URL", placeholder: "https://…" },
  { key: "website", label: "Website", placeholder: "https://…" },
  { key: "nip05", label: "NIP-05 Address", placeholder: "you@domain.com" },
  { key: "lud16", label: "Lightning Address (LUD-16)", placeholder: "you@wallet.com" },
];

interface NostrProfileEditorProps {
  formState: NostrProfileFormState;
  onField: (field: keyof NostrProfile, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onImport: () => void;
  onToggleAdvanced: () => void;
}

export function NostrProfileEditor({
  formState,
  onField,
  onSave,
  onCancel,
  onImport,
  onToggleAdvanced,
}: NostrProfileEditorProps) {
  const { values, original, saving, importing, error, success, showAdvanced } = formState;

  const isDirty = BASIC_FIELDS.concat(ADVANCED_FIELDS).some(
    ({ key }) => (values[key] ?? "") !== (original[key] ?? ""),
  );

  return (
    <div className="space-y-3 mt-4 border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nostr Profile
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={importing || saving}
          onClick={onImport}
          className="text-xs h-7"
        >
          {importing ? "Importing…" : "Import from relay"}
        </Button>
      </div>

      <div className="space-y-2">
        {BASIC_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              value={typeof values[key] === "string" ? (values[key] as string) : ""}
              placeholder={placeholder}
              disabled={saving || importing}
              onChange={(e) => onField(key, e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>

      <Collapsible open={showAdvanced} onOpenChange={onToggleAdvanced}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDownIcon
              className={cn("size-3 transition-transform", showAdvanced && "rotate-180")}
            />
            Advanced fields
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          {ADVANCED_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                value={typeof values[key] === "string" ? (values[key] as string) : ""}
                placeholder={placeholder}
                disabled={saving || importing}
                onChange={(e) => onField(key, e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{error}</p>
      )}
      {success && (
        <p className="text-xs text-emerald-600 bg-emerald-500/10 rounded px-2 py-1">{success}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={saving || importing || !isDirty}
          onClick={onSave}
          className="h-7 text-xs"
        >
          {saving ? "Publishing…" : "Publish"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving || importing}
          onClick={onCancel}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
