/**
 * item_carousel — Control UI image-first item carousel card (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult } from "./common.js";

const ActionSchema = Type.Object({
  id: Type.String({ description: "Stable action id for this card button." }),
  label: Type.String({ description: "Button label shown in the card." }),
  variant: Type.Optional(
    Type.String({
      description: "Optional button variant (default/secondary/outline/ghost/destructive).",
    }),
  ),
  disabled: Type.Optional(Type.Boolean({ description: "Disable this action button." })),
});

const ItemSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this item." }),
  name: Type.String({ description: "Primary title of the card item." }),
  subtitle: Type.Optional(Type.String({ description: "Secondary one-line description." })),
  image: Type.Optional(Type.String({ description: "HTTP(S) image URL for the card cover." })),
  color: Type.Optional(Type.String({ description: "Fallback color when image is missing." })),
  actions: Type.Optional(Type.Array(ActionSchema, { minItems: 1 })),
});

const ParametersSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this carousel payload." }),
  title: Type.Optional(Type.String({ description: "Optional carousel heading." })),
  description: Type.Optional(Type.String({ description: "Optional carousel supporting text." })),
  items: Type.Array(ItemSchema, {
    description: "Carousel items, usually 3-8 cards.",
    minItems: 1,
  }),
});

export function createItemCarouselTool(): AnyAgentTool {
  return {
    label: "Item Carousel",
    name: "item_carousel",
    description:
      "Render an image-first horizontal item carousel in Control UI. " +
      "Use for routes, destinations, products, or POI spotlights where each item has a cover image and short copy. " +
      "The tool returns the same JSON payload for the UI.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
