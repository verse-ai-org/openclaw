import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

export const PluginJsonValueSchema = Type.Unknown();

export const PluginControlUiDescriptorSchema = Type.Object(
  {
    id: NonEmptyString,
    pluginId: NonEmptyString,
    pluginName: Type.Optional(NonEmptyString),
    surface: Type.Union([
      Type.Literal("session"),
      Type.Literal("tool"),
      Type.Literal("run"),
      Type.Literal("settings"),
    ]),
    label: NonEmptyString,
    description: Type.Optional(Type.String()),
    placement: Type.Optional(Type.String()),
    schema: Type.Optional(PluginJsonValueSchema),
    requiredScopes: Type.Optional(Type.Array(NonEmptyString)),
  },
  { additionalProperties: false },
);

export const PluginsUiDescriptorsParamsSchema = Type.Object({}, { additionalProperties: false });

export const PluginsUiDescriptorsResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    descriptors: Type.Array(PluginControlUiDescriptorSchema),
  },
  { additionalProperties: false },
);

export const PluginsSessionActionParamsSchema = Type.Object(
  {
    pluginId: NonEmptyString,
    actionId: NonEmptyString,
    sessionKey: Type.Optional(NonEmptyString),
    payload: Type.Optional(PluginJsonValueSchema),
  },
  { additionalProperties: false },
);

export const PluginsSessionActionSuccessResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    result: Type.Optional(PluginJsonValueSchema),
    continueAgent: Type.Optional(Type.Boolean()),
    reply: Type.Optional(PluginJsonValueSchema),
  },
  { additionalProperties: false },
);

export const PluginsSessionActionFailureResultSchema = Type.Object(
  {
    ok: Type.Literal(false),
    error: Type.String(),
    code: Type.Optional(Type.String()),
    details: Type.Optional(PluginJsonValueSchema),
  },
  { additionalProperties: false },
);

export const PluginsSessionActionResultSchema = Type.Union([
  PluginsSessionActionSuccessResultSchema,
  PluginsSessionActionFailureResultSchema,
]);

// ── Fork: plugins.status / enable / install (ui-react settings) ───────────────

export const PluginConfigUiHintSchema = Type.Object(
  {
    label: Type.Optional(Type.String()),
    help: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    advanced: Type.Optional(Type.Boolean()),
    sensitive: Type.Optional(Type.Boolean()),
    placeholder: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const PluginRecordSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    version: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    kind: Type.Optional(Type.String()),
    source: Type.String(),
    origin: Type.String(),
    workspaceDir: Type.Optional(Type.String()),
    enabled: Type.Boolean(),
    status: Type.Union([
      Type.Literal("loaded"),
      Type.Literal("disabled"),
      Type.Literal("error"),
    ]),
    error: Type.Optional(Type.String()),
    toolNames: Type.Array(Type.String()),
    hookNames: Type.Array(Type.String()),
    channelIds: Type.Array(Type.String()),
    providerIds: Type.Array(Type.String()),
    gatewayMethods: Type.Array(Type.String()),
    cliCommands: Type.Array(Type.String()),
    services: Type.Array(Type.String()),
    commands: Type.Array(Type.String()),
    httpRoutes: Type.Number(),
    hookCount: Type.Number(),
    configSchema: Type.Boolean(),
    configUiHints: Type.Optional(Type.Record(Type.String(), PluginConfigUiHintSchema)),
    configJsonSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export const PluginsStatusParamsSchema = Type.Object({}, { additionalProperties: false });

export const PluginsStatusResultSchema = Type.Object(
  {
    plugins: Type.Array(PluginRecordSchema),
    workspaceDir: Type.Optional(Type.String()),
    diagnostics: Type.Optional(
      Type.Array(
        Type.Object(
          {
            level: Type.Union([Type.Literal("warn"), Type.Literal("error")]),
            message: Type.String(),
            pluginId: Type.Optional(Type.String()),
            source: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);

export const PluginsEnableParamsSchema = Type.Object(
  {
    pluginId: Type.String(),
    enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const PluginsEnableResultSchema = Type.Object(
  {
    pluginId: Type.String(),
    enabled: Type.Boolean(),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const PluginsInstallParamsSchema = Type.Object(
  {
    spec: Type.String(),
  },
  { additionalProperties: false },
);

export const PluginsInstallResultSchema = Type.Object(
  {
    ok: Type.Boolean(),
    pluginId: Type.Optional(Type.String()),
    version: Type.Optional(Type.String()),
    error: Type.Optional(Type.String()),
    code: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
