/**
 * geo_map — Control UI geographic map card (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult } from "./common.js";

const MarkerIconSchema = Type.Object({
  type: stringEnum(["dot", "emoji", "image"] as const),
  color: Type.Optional(Type.String()),
  borderColor: Type.Optional(Type.String()),
  radius: Type.Optional(Type.Number({ minimum: 3, maximum: 16 })),
  value: Type.Optional(Type.String()),
  size: Type.Optional(Type.Number({ minimum: 16, maximum: 40 })),
  bgColor: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  width: Type.Optional(Type.Number({ minimum: 16, maximum: 64 })),
  height: Type.Optional(Type.Number({ minimum: 16, maximum: 64 })),
  borderRadius: Type.Optional(Type.Number({ minimum: 0, maximum: 999 })),
});

const MarkerSchema = Type.Object({
  id: Type.Optional(Type.String()),
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lng: Type.Number({ minimum: -180, maximum: 180 }),
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  tooltip: Type.Optional(stringEnum(["none", "hover", "always"] as const)),
  icon: Type.Optional(MarkerIconSchema),
});

const RoutePointSchema = Type.Object({
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lng: Type.Number({ minimum: -180, maximum: 180 }),
});

const RouteSchema = Type.Object({
  id: Type.Optional(Type.String()),
  points: Type.Array(RoutePointSchema, { minItems: 2 }),
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  tooltip: Type.Optional(stringEnum(["none", "hover", "always"] as const)),
  color: Type.Optional(Type.String()),
  weight: Type.Optional(Type.Number({ minimum: 1, maximum: 12 })),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  dashArray: Type.Optional(Type.String()),
});

const ViewportSchema = Type.Object({
  mode: Type.Optional(stringEnum(["fit", "center"] as const)),
  padding: Type.Optional(Type.Number({ minimum: 0 })),
  maxZoom: Type.Optional(Type.Number({ minimum: 1, maximum: 22 })),
  target: Type.Optional(stringEnum(["markers", "routes", "all"] as const)),
  center: Type.Optional(
    Type.Object({
      lat: Type.Number({ minimum: -90, maximum: 90 }),
      lng: Type.Number({ minimum: -180, maximum: 180 }),
    }),
  ),
  zoom: Type.Optional(Type.Number({ minimum: 1, maximum: 22 })),
});

const ParametersSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this map payload." }),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  markers: Type.Array(MarkerSchema, {
    description: "Map marker points to render.",
    minItems: 1,
  }),
  routes: Type.Optional(Type.Array(RouteSchema, { minItems: 1 })),
  viewport: Type.Optional(ViewportSchema),
  theme: Type.Optional(stringEnum(["light", "dark"] as const)),
  showZoomControl: Type.Optional(Type.Boolean()),
});

export function createGeoMapTool(): AnyAgentTool {
  return {
    label: "Geo Map",
    name: "geo_map",
    description:
      "Render a rich interactive geographic map in Control UI with markers and optional routes. " +
      "Use for itinerary legs, POI distribution, and route validation visuals. " +
      "The tool returns the same JSON payload for the UI.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
