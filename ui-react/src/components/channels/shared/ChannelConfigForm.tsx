import { useEffect, useMemo, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { CircleHelpIcon } from "lucide-react";
import type { ConfigUiHints } from "@/types/channels";

type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  default?: unknown;
};

const FEISHU_DEFAULT_VALUES: Record<string, unknown> = {
  connectionMode: "websocket",
  dmPolicy: "open",
  domain: "feishu",
  groupPolicy: "open",
  renderMode: "card",
  requireMention: true,
};

const FEISHU_REQUIRED_FIELD_HINTS: Record<string, string> = {
  appId: "Get your App ID from Feishu Open Platform -> App Credentials.",
  appSecret: "Get your App Secret from Feishu Open Platform -> App Credentials.",
  verificationToken: "Required in webhook mode for event verification.",
  webhookPath: "Webhook callback path, for example: /feishu/events.",
};

const FEISHU_HIDDEN_OPTIONAL_KEYS = new Set(["enabled", "accounts"]);

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
      const props: Record<string, JsonSchema> = cur.properties ?? {};
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

function FieldWrapper({
  label,
  help,
  required,
  labelHint,
  children,
}: {
  label?: string;
  help?: React.ReactNode;
  required?: boolean;
  labelHint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1">
          <Label className="text-sm font-medium">{label}</Label>
          {required && <span className="text-[10px] font-bold text-red-500 leading-none">*</span>}
          {labelHint}
        </div>
      )}
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
  required?: boolean;
  labelHint?: React.ReactNode;
}

function RenderNode({
  schema,
  path,
  config,
  hints,
  disabled,
  onPatch,
  showLabel = true,
  required,
  labelHint,
}: RenderNodeProps) {
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
      return <RenderNode schema={nonNull[0]} path={path} config={config} hints={hints} disabled={disabled} onPatch={onPatch} showLabel={showLabel} required={required} />;
    }
    const literals = nonNull.flatMap((v) => v.enum ?? []);
    if (literals.length === nonNull.length) {
      return (
        <FieldWrapper
          label={showLabel ? label : undefined}
          help={help}
          required={required}
          labelHint={labelHint}
        >
          <EnumSelect value={value} options={literals} defaultVal={schema.default} disabled={disabled} onSelect={(v) => onPatch(path, v)} />
        </FieldWrapper>
      );
    }
  }

  const type = schemaType(schema);

  if (type === "object") {
    const props = schema.properties ?? {};
    const requiredSet = new Set(schema.required ?? []);
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
          <RenderNode key={key} schema={props[key]} path={[...path, key]} config={config} hints={hints} disabled={disabled} onPatch={onPatch} required={requiredSet.has(key)} />
        ))}
      </div>
    );
  }

  if (type === "array") {
    const items = (value as unknown[]) ?? [];
    const itemSchema = schema.items;
    return (
      <FieldWrapper label={showLabel ? label : undefined} help={help} labelHint={labelHint}>
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
      <FieldWrapper
        label={showLabel ? label : undefined}
        help={help}
        required={required}
        labelHint={labelHint}
      >
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
      <FieldWrapper
        label={showLabel ? label : undefined}
        help={help}
        required={required}
        labelHint={labelHint}
      >
        <EnumSelect value={value} options={schema.enum} defaultVal={schema.default} disabled={disabled} onSelect={(v) => onPatch(path, v)} />
      </FieldWrapper>
    );
  }

  return (
    <FieldWrapper
      label={showLabel ? label : undefined}
      help={help}
      required={required}
      labelHint={labelHint}
    >
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
  configSaving, configSchemaLoading, configFormDirty, configReloading = false,
  onPatch, onSave, onReload,
}: {
  channelId: string;
  configForm: Record<string, unknown> | null;
  configSchema: unknown;
  configUiHints: ConfigUiHints;
  configSaving: boolean;
  configSchemaLoading: boolean;
  configFormDirty: boolean;
  configReloading?: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
  onSave: () => void;
  onReload: () => void;
}) {
  const disabled = configSaving || configSchemaLoading || configReloading;
  const schema = configSchema as JsonSchema | null;
  const channelNode = schema ? resolveNode(schema, ["channels", channelId]) : null;
  const rawChannels = configForm?.channels as Record<string, unknown> | undefined;
  const channelValue = (rawChannels?.[channelId] as Record<string, unknown>) ?? {};
  const isFeishu = channelId === "feishu";
  const [defaultsInitialized, setDefaultsInitialized] = useState(false);
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  useEffect(() => {
    setDefaultsInitialized(false);
    setOptionalExpanded(false);
  }, [channelId]);

  useEffect(() => {
    if (!isFeishu || defaultsInitialized || !configForm) return;
    for (const [key, val] of Object.entries(FEISHU_DEFAULT_VALUES)) {
      const current = channelValue[key];
      if (
        current === undefined ||
        current === null ||
        (typeof current === "string" && current.trim() === "")
      ) {
        onPatch(["channels", channelId, key], val);
      }
    }
    // Mark initialized after first pass so user can intentionally clear values.
    setDefaultsInitialized(true);
  }, [isFeishu, defaultsInitialized, configForm, channelValue, onPatch, channelId]);

  const feishuRequiredKeys = useMemo(() => {
    if (!isFeishu) return [] as string[];
    const mode =
      typeof channelValue.connectionMode === "string" && channelValue.connectionMode.trim()
        ? channelValue.connectionMode
        : "websocket";
    return mode === "webhook"
      ? ["appId", "appSecret", "verificationToken", "webhookPath"]
      : ["appId", "appSecret"];
  }, [isFeishu, channelValue.connectionMode]);

  const feishuOptionalKeys = useMemo(() => {
    if (!isFeishu || !channelNode?.properties) return [] as string[];
    const requiredSet = new Set(feishuRequiredKeys);
    const priorityMap = new Map(
      Object.keys(FEISHU_DEFAULT_VALUES).map((key, idx) => [key, idx]),
    );
    return Object.keys(channelNode.properties)
      .filter((key) => !requiredSet.has(key) && !FEISHU_HIDDEN_OPTIONAL_KEYS.has(key))
      .sort((a, b) => {
        const pa = priorityMap.get(a);
        const pb = priorityMap.get(b);
        if (pa !== undefined || pb !== undefined) {
          if (pa === undefined) return 1;
          if (pb === undefined) return -1;
          return pa - pb;
        }
        return a.localeCompare(b);
      });
  }, [isFeishu, channelNode, feishuRequiredKeys]);

  return (
    <div className="mt-4 space-y-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuration</div>

      {configSchemaLoading ? (
        <p className="text-xs text-muted-foreground">Loading schema…</p>
      ) : channelNode && configForm ? (
        <>
          {isFeishu ? (
            <div className="space-y-5">
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Required Fields</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Minimum setup
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {feishuRequiredKeys.map((key) => {
                    const fieldSchema = channelNode.properties?.[key];
                    if (!fieldSchema) return null;
                    const help = FEISHU_REQUIRED_FIELD_HINTS[key];
                    const showHoverHint = key === "appId" || key === "appSecret";
                    const hintPath = ["channels", channelId, key];
                    const hint = configUiHints[hintPath.join(".")] ?? {};
                    const mergedHints = {
                      ...configUiHints,
                      [hintPath.join(".")]: {
                        ...(typeof hint === "object" && hint ? hint : {}),
                        ...(help && !showHoverHint ? { help } : {}),
                      },
                    } as ConfigUiHints;
                    return (
                      <div key={key} className="rounded-lg bg-muted/25 border border-border/60 p-3">
                        <RenderNode
                          schema={fieldSchema}
                          path={hintPath}
                          config={configForm}
                          hints={mergedHints}
                          disabled={disabled}
                          onPatch={onPatch}
                          required
                          labelHint={
                            showHoverHint ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={`${key} help`}
                                  >
                                    <CircleHelpIcon className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={8}>
                                  {help}
                                </TooltipContent>
                              </Tooltip>
                            ) : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {feishuOptionalKeys.length > 0 && (
                <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
                  <div className="grid grid-cols-[minmax(120px,1fr)_auto] items-center gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Optional Settings</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => setOptionalExpanded((v) => !v)}
                    >
                      {optionalExpanded ? "Collapse" : "Expand"}
                    </Button>
                  </div>
                  {optionalExpanded && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {feishuOptionalKeys.map((key) => {
                          const fieldSchema = channelNode.properties?.[key];
                          if (!fieldSchema) return null;
                          return (
                            <div key={key} className="rounded-lg bg-muted/25 border border-border/60 p-3">
                              <RenderNode
                                schema={fieldSchema}
                                path={["channels", channelId, key]}
                                config={configForm}
                                hints={configUiHints}
                                disabled={disabled}
                                onPatch={onPatch}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                        Multi-account field (`accounts`) is hidden in this UI to keep setup simple.
                        Use config file editing if you need advanced multi-account setup.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
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
          )}
        </>
      ) : schema && !channelNode ? (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800">No configuration options available yet.</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            This channel has no editable settings in the current config.
            If you just enabled the plugin, restart the gateway so it can register its schema, then reload this dialog.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Schema unavailable.</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={disabled || !configFormDirty} onClick={onSave}>
          {configSaving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={onReload}>
          {configReloading ? "Reloading…" : "Reload"}
        </Button>
      </div>
    </div>
  );
}
