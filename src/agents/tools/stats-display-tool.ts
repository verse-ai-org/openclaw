/**
 * stats_display — Control UI KPI / stats grid (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult } from "./common.js";

const StatItemSchema = Type.Object(
  {
    key: Type.String({ description: "Stable key for the stat (e.g. revenue)." }),
    label: Type.String({ description: "Human-readable label." }),
    value: Type.Unknown({
      description: "Main value (string or number). Optional format/diff/sparkline via extra fields.",
    }),
  },
  {
    additionalProperties: true,
    description:
      "Stat row. May include format, diff, sparkline objects per Tool UI StatsDisplay schema.",
  },
);

const ParametersSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this stats block." }),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  stats: Type.Array(StatItemSchema, { minItems: 1 }),
});

export function createStatsDisplayTool(): AnyAgentTool {
  return {
    label: "Stats Display",
    name: "stats_display",
    description:
      "Render a KPI / metrics grid in Control UI (values, optional format, diffs, sparklines). " +
      "Pass id, stats[] with key, label, value, and optional formatting fields. " +
      "The tool returns the same JSON for the UI card.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
