import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

export const ArtifactTypeSchema = Type.Union([
  Type.Literal("image"),
  Type.Literal("audio"),
  Type.Literal("file"),
]);

const ArtifactQueryParamsProperties = {
  sessionKey: Type.Optional(NonEmptyString),
  runId: Type.Optional(NonEmptyString),
  taskId: Type.Optional(NonEmptyString),
  agentId: Type.Optional(NonEmptyString),
};

export const ArtifactQueryParamsSchema = Type.Object(ArtifactQueryParamsProperties, {
  additionalProperties: false,
});

export const ArtifactGetParamsSchema = Type.Object(
  {
    ...ArtifactQueryParamsProperties,
    artifactId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ArtifactRefSchema = Type.Object(
  {
    artifactId: NonEmptyString,
    role: Type.Optional(Type.Union([Type.Literal("input"), Type.Literal("output")])),
  },
  { additionalProperties: false },
);

export const ArtifactSummarySourceSchema = Type.Union([
  Type.Literal("user-upload"),
  Type.Literal("assistant-output"),
  Type.Literal("tool-output"),
  Type.Literal("offload"),
]);

export const ArtifactIngestChannelSchema = Type.Union([
  Type.Literal("inline-base64"),
  Type.Literal("path-ref"),
  Type.Literal("managed-image"),
  Type.Literal("transcript-block"),
]);

export const ArtifactSummarySchema = Type.Object(
  {
    id: NonEmptyString,
    type: ArtifactTypeSchema,
    title: NonEmptyString,
    mimeType: Type.Optional(NonEmptyString),
    sizeBytes: Type.Optional(Type.Integer({ minimum: 0 })),
    sessionKey: Type.Optional(NonEmptyString),
    runId: Type.Optional(NonEmptyString),
    taskId: Type.Optional(NonEmptyString),
    messageSeq: Type.Optional(Type.Integer({ minimum: 1 })),
    contentIndex: Type.Optional(Type.Integer({ minimum: 0 })),
    source: Type.Optional(ArtifactSummarySourceSchema),
    role: Type.Optional(Type.Union([Type.Literal("input"), Type.Literal("output")])),
    ingestChannel: Type.Optional(ArtifactIngestChannelSchema),
    /** Inbound preview ref for webchat (`media://inbound/<id>`). */
    mediaRef: Type.Optional(NonEmptyString),
    /** Original absolute path for Electron path-ref reveal; not used by artifacts.download. */
    localRevealPath: Type.Optional(NonEmptyString),
    /** Workspace staging copy path when edit intent copied path-ref files; Electron reveal only. */
    stagingRevealPath: Type.Optional(NonEmptyString),
    download: Type.Object(
      {
        mode: Type.Union([Type.Literal("bytes"), Type.Literal("url"), Type.Literal("unsupported")]),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const ChatSendAckSchema = Type.Object(
  {
    runId: NonEmptyString,
    status: Type.Union([Type.Literal("started"), Type.Literal("in_flight")]),
    artifacts: Type.Optional(Type.Array(ArtifactSummarySchema)),
  },
  { additionalProperties: false },
);

export const ChatHistoryMessageArtifactProjectionSchema = Type.Object(
  {
    artifactRefs: Type.Optional(Type.Array(ArtifactRefSchema)),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
  },
  { additionalProperties: true },
);

export const ArtifactsListParamsSchema = ArtifactQueryParamsSchema;

export const ArtifactsListResultSchema = Type.Object(
  {
    artifacts: Type.Array(ArtifactSummarySchema),
  },
  { additionalProperties: false },
);

export const ArtifactsGetParamsSchema = ArtifactGetParamsSchema;

export const ArtifactsGetResultSchema = Type.Object(
  {
    artifact: ArtifactSummarySchema,
  },
  { additionalProperties: false },
);

export const ArtifactsDownloadParamsSchema = ArtifactGetParamsSchema;

export const ArtifactsDownloadResultSchema = Type.Object(
  {
    artifact: ArtifactSummarySchema,
    encoding: Type.Optional(Type.Literal("base64")),
    data: Type.Optional(Type.String()),
    url: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);
