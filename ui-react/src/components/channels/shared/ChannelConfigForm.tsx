import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ConfigUiHints } from "@/types/channels";

type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  default?: unknown;
};

function getHint(path: Array<string | number>, hints: ConfigUiHints) {
  return hints[path.join(".")];
}

function isSensitivePath(path: Array<string | number>): boolean {
  const last = String(path[path.length - 1] ?? "").toLowerCase();
  return (
    last.includes("token") ||
    last.includes("secret") ||
    last.includes("password") ||
    last.includes("key") ||
    last.includes("credential")
  );
}

function getValueAt(config: Record<string, unknown>, path: Array<string | number>): unknown {
  let cur: unknown = config;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function schemaType(schema: JsonSchema): string {
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return "string";
}

function resolveNode(schema: JsonSchema, path: Array<string | number>): JsonSchema | null {
  let cur: JsonSchema | null = schema;
  for (const key of path) {
    if (!cur) return null;
    const t = schemaType(cur);
    if (t === "object") {
      const props = cur.properties ?? {};
      if (typeof key === "string" && props[key]) { cur = props[key]; continue; }
      const add = cur.additionalProperties;
      if (typeof key === "string" && add && typeof add === "object") { cur = add as JsonSchema; continue; }
      return null;
    }
    if (t === "array") { cur = cur.items ?? null; continue; }
    return null;
  }
  return cur;
}

function FieldWrapper({ label, help, children }: { label?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}

function EnumSelect({
  value, options, defaultVal, disabled, onSelect,
}: { value: unknown; options: unknown[]; defaultVal: unknown; disabled: boolean; onSelect: (v: unknown) => void }) {
  const current = value ?? defaultVal;
  return (
    <Select
      value={current != null ? String(current) : ""}
      onValueChange={(v) => onSelect(v === "" ? undefined : v)}
      disabled={disabled}
    >
      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
      <SelectContent>
        {options.map((opt, i) => (
          <SelectItem key={i} value={String(opt)}>{String(opt)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface RenderNodeProps {
  schema: JsonSchema;
  path: Array<string | number>;
  config: Record<string, unknown>;
  hints: ConfigUiHints;
  disabled: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
  showLabel?: boolean;
}

function RenderNode({ schema, path, config, hints, disabled, onPatch, showLabel = true }: RenderNodeProps) {
  const hint = getHint(path, hints) as { label?: string; help?: string; placeholder?: string; sensitive?: boolean; order?: number } | undefined;
  const label = hint?.label ?? schema.title ?? String(path[path.length - 1] ?? "");
  const help = hint?.help ?? schema.description;
  const sensitive = hint?.sensitive ?? isSensitivePath(path);
  const value = getValueAt(config, path);
  const placeholder = hint?.placeholder ?? "";

  const variants = schema.anyOf?.length ? schema.anyOf : (schema.oneOf ?? []);
  if (variants.length) {
    const nonNull = variants.filter((v) => v.type !== "null" && !v.enum?.includes(null));
    if (nonNull.length === 1) {
      return <RenderNode schema={nonNull[0]} path={path} config={config} hints={hints} disabled={disabled} onPatch={onPatch} showLabel={showLabel} />;
    }
    const literals = nonNull.flatMap((v) => v.enum ?? []);
    if (literals.length === nonNull.length) {
      return (
        <FieldWrapper label={showLabel ? label : undefined} help={help}>
          <EnumSelect value={value} options={literals} defaultVal={schema.default} disabled={disabled} onSelect={(v) => onPatch(path, v)} />
        </FieldWrapper>
      );
    }
  }

  const type = schemaType(schema);

  if (type === "object") {
    const props = schema.properties ?? {};
    const sortedKeys = Object.keys(props).sort((a, b) => {
      const oa = (getHint([...path, a], hints) as { order?: number } | undefined)?.order ?? 0;
      const ob = (getHint([...path, b], hints) as { order?: number } | undefined)?.order ?? 0;
      return oa !== ob ? oa - ob : a.localeCompare(b);
    });
    return (
      <div className="space-y-3">
        {showLabel && label && <p className="text-sm font-semibold">{label}</p>}
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
        {sortedKeys.map((key) => (
          <RenderNode key={key} schema={props[key]} path={[...path, key]} config={config} hints={hints} disabled={disabled} onPatch={onPatch} />
        ))}
      </div>
    );
  }

  if (type === "array") {
    const items = (value as unknown[]) ?? [];
    const itemSchema = schema.items;
    return (
      <FieldWrapper label={showLabel ? label : undefined} help={help}>
        <div className="space-y-2">
          {items.map((_, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              {itemSchema ? (
                <RenderNode schema={itemSchema} path={[...path, idx]} config={config} hints={hints} disabled={disabled} onPatch={onPatch} showLabel={false} />
              ) : (
                <span className="text-sm font-mono">{String(items[idx])}</span>
              )}
              <Button size="sm" variant="ghost" disabled={disabled}
                onClick={() => { const next = [...items]; next.splice(idx, 1); onPatch(path, next); }}>
                Remove
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" disabled={disabled}
            onClick={() => onPatch(path, [...items, itemSchema?.default ?? ""])}>
            Add
          </Button>
        </div>
      </FieldWrapper>
    );
  }

  if (type === "boolean") {
    const checked = typeof value === "boolean" ? value : Boolean(schema.default);
    return (
      <div className="flex items-center gap-2">
        <Switch id={path.join(".")} checked={checked} disabled={disabled} onCheckedChange={(v) => onPatch(path, v)} />
        {showLabel && <Label htmlFor={path.join(".")} className="text-sm">{label}</Label>}
      </div>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <FieldWrapper label={showLabel ? label : undefined} help={help}>
        <Input type="number" value={value != null ? String(value) : ""} placeholder={placeholder} disabled={disabled}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") { onPatch(path, undefined); return; }
            const n = Number(v);
            onPatch(path, isNaN(n) ? v : type === "integer" ? Math.trunc(n) : n);
          }} />
      </FieldWrapper>
    );
  }

  if (schema.enum) {
    return (
      <FieldWrapper label={showLabel ? label : undefined} help={help}>
        <EnumSelect value={value} options={schema.enum} defaultVal={schema.default} disabled={disabled} onSelect={(v) => onPatch(path, v)} />
      </FieldWrapper>
    );
  }

  return (
    <FieldWrapper label={showLabel ? label : undefined} help={help}>
      <Input
        type={sensitive ? "password" : "text"}
        value={typeof value === "string" ? value : (value != null ? String(value) : "")}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => { const v = e.target.value; onPatch(path, v === "" ? undefined : v); }}
      />
    </FieldWrapper>
  );
}

const EXTRA_FIELDS = ["groupPolicy", "streamMode", "dmPolicy"] as const;

function ExtraChannelFields({ channelValue }: { channelValue: Record<string, unknown> }) {
  const entries = EXTRA_FIELDS.flatMap((f) =>
    f in channelValue ? [[f, channelValue[f]] as [string, unknown]] : [],
  );
  if (!entries.length) return null;
  return (
    <div className="space-y-1.5 mt-3 pt-3 border-t">
      {entries.map(([field, val]) => (
        <div key={field} className="flex justify-between text-xs">
          <span className="text-muted-foreground">{field}</span>
          <span className="font-mono">{val != null ? String(val) : "n/a"}</span>
        </div>
      ))}
    </div>
  );
}

export function ChannelConfigForm({
  channelId, configForm, configSchema, configUiHints,
  configSaving, configSchemaLoading, configFormDirty,
  onPatch, onSave, onReload,
}: {
  channelId: string;
  configForm: Record<string, unknown> | null;
  configSchema: unknown;
  configUiHints: ConfigUiHints;
  configSaving: boolean;
  configSchemaLoading: boolean;
  configFormDirty: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
  onSave: () => void;
  onReload: () => void;
}) {
  const disabled = configSaving || configSchemaLoading;
  const schema = configSchema as JsonSchema | null;
  const channelNode = schema ? resolveNode(schema, ["channels", channelId]) : null;
  const rawChannels = configForm?.channels as Record<string, unknown> | undefined;
  const channelValue = (rawChannels?.[channelId] as Record<string, unknown>) ?? {};

  return (
    <div className="mt-4 space-y-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuration</div>

      {configSchemaLoading ? (
        <p className="text-xs text-muted-foreground">Loading schema…</p>
      ) : channelNode && configForm ? (
        <>
          <RenderNode
            schema={channelNode}
            path={["channels", channelId]}
            config={configForm}
            hints={configUiHints}
            disabled={disabled}
            onPatch={onPatch}
            showLabel={false}
          />
          <ExtraChannelFields channelValue={channelValue} />
        </>
      ) : (
        <p className={cn("text-xs", schema ? "text-muted-foreground" : "text-destructive")}>
          {schema ? "No configuration schema for this channel." : "Schema unavailable."}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={disabled || !configFormDirty} onClick={onSave}>
          {configSaving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={onReload}>
          Reload
        </Button>
      </div>
    </div>
  );
}
