export const EventType = {
  // Run lifecycle
  RunStarted: "run.started",
  RunFinished: "run.finished",
  RunError: "run.error",
  RunAborted: "run.aborted",
  RunActiveSnapshot: "run.activeSnapshot",

  // Message lifecycle
  MessagesSnapshot: "messages.snapshot",
  MessageStart: "message.start",
  MessageAppendText: "message.appendText",
  MessageSetLiveText: "message.setLiveText",
  MessageEnd: "message.end",

  // Tool lifecycle
  ToolStart: "tool.start",
  ToolUi: "tool.ui",
  ToolUpdate: "tool.update",
  ToolResult: "tool.result",
  ToolError: "tool.error",
} as const;

export type CanonicalEventType = (typeof EventType)[keyof typeof EventType];
