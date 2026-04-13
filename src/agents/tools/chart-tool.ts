/**
 * chart — Control UI bar/line chart card (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult } from "./common.js";

const ChartSeriesSchema = Type.Object({
  key: Type.String({ description: "Field name on each data row for this series (y-axis)." }),
  label: Type.String({ description: "Legend / tooltip label." }),
  color: Type.Optional(Type.String({ description: "Optional CSS color for this series." })),
});

const ParametersSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this chart." }),
  type: stringEnum(["bar", "line"] as const),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  data: Type.Array(Type.Record(Type.String(), Type.Unknown()), {
    description: "Table rows; each row must include xKey and every series.key.",
    minItems: 1,
  }),
  xKey: Type.String({
    description: "Field name used for the X axis (categories or numbers).",
  }),
  series: Type.Array(ChartSeriesSchema, { minItems: 1 }),
  colors: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
  showLegend: Type.Optional(Type.Boolean()),
  showGrid: Type.Optional(Type.Boolean()),
});

export function createChartTool(): AnyAgentTool {
  return {
    label: "Chart",
    name: "chart",
    description:
      "Render a bar or line chart in Control UI from tabular JSON data. " +
      "Supply id, type (bar|line), data rows, xKey, and series definitions. " +
      "The tool returns the same JSON for the rich chart card.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
