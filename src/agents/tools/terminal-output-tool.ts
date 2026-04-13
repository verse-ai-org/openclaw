/**
 * terminal_output — Control UI terminal session card (passthrough).
 */
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult } from "./common.js";

const ParametersSchema = Type.Object({
  id: Type.String({ description: "Stable unique id for this terminal card." }),
  command: Type.String({ description: "Shell command that was run (displayed in header)." }),
  stdout: Type.Optional(Type.String({ description: "Standard output (ANSI allowed)." })),
  stderr: Type.Optional(Type.String({ description: "Standard error text." })),
  exitCode: Type.Number({
    description: "Process exit code (0 success; non-zero for failure).",
  }),
  durationMs: Type.Optional(Type.Number({ description: "Runtime in milliseconds." })),
  cwd: Type.Optional(Type.String({ description: "Working directory shown in UI." })),
  truncated: Type.Optional(Type.Boolean({ description: "True if output was truncated upstream." })),
  maxCollapsedLines: Type.Optional(
    Type.Number({ description: "Collapse output after this many lines.", minimum: 1 }),
  ),
});

export function createTerminalOutputTool(): AnyAgentTool {
  return {
    label: "Terminal Output",
    name: "terminal_output",
    description:
      "Render a terminal-style card in Control UI with command, stdout/stderr, exit code. " +
      "Use after running a command (or to show a recorded run) instead of pasting raw text. " +
      "The tool returns the same JSON for the UI.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
