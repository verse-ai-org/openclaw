/**
 * code_block — Control UI syntax-highlighted code card (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult } from "./common.js";

const ParametersSchema = Type.Object({
  id: Type.String({
    description: "Stable unique id for this block (e.g. 'snippet-auth-middleware').",
  }),
  code: Type.String({ description: "Source code or log text to display." }),
  language: Type.Optional(
    Type.String({
      description: "Shiki language id (e.g. typescript, python, bash, json). Default: text.",
    }),
  ),
  lineNumbers: Type.Optional(
    stringEnum(["visible", "hidden"] as const, {
      description: "Show or hide line numbers. Default visible.",
    }),
  ),
  filename: Type.Optional(Type.String({ description: "Optional file name shown in the header." })),
  highlightLines: Type.Optional(
    Type.Array(Type.Number(), { description: "1-based line numbers to emphasize." }),
  ),
  maxCollapsedLines: Type.Optional(
    Type.Number({ description: "Collapse long output after this many lines.", minimum: 1 }),
  ),
});

export function createCodeBlockTool(): AnyAgentTool {
  return {
    label: "Code Block",
    name: "code_block",
    description:
      "Render a syntax-highlighted code or log block in Control UI. " +
      "Use when showing snippets, configs, diffs, or command output as a rich card. " +
      "Pass id, code, and optional language/filename; the tool returns the same JSON for the UI.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
