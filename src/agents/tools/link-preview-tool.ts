/**
 * link_preview — Control UI link preview card (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { optionalStringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult } from "./common.js";

const ParametersSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this preview card." }),
  href: Type.String({
    description: "Absolute https URL to open (required).",
    minLength: 1,
  }),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ description: "Hero image URL (https)." })),
  domain: Type.Optional(Type.String({ description: "Display domain override." })),
  favicon: Type.Optional(Type.String({ description: "Favicon URL (https)." })),
  ratio: optionalStringEnum(["auto", "1:1", "4:3", "16:9", "9:16"] as const),
  fit: optionalStringEnum(["cover", "contain"] as const),
  createdAt: Type.Optional(
    Type.String({ description: "ISO-8601 datetime string for the card." }),
  ),
  locale: Type.Optional(Type.String({ description: "BCP-47 locale for formatting." })),
});

export function createLinkPreviewTool(): AnyAgentTool {
  return {
    label: "Link Preview",
    name: "link_preview",
    description:
      "Render a rich link preview card in Control UI (title, description, image). " +
      "Use when sharing a URL and optional metadata fetched or inferred by you. " +
      "The tool returns the same JSON payload for the UI.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
