import {
  MessagePrimitive,
  AuiIf,
  useMessage,
} from "@assistant-ui/react";
import { type FC, useMemo } from "react";
import {
  AssistantMarkdownPart
} from "../assistant-ui/markdown-text.tsx";
import { AssistantLoadingIndicator } from "../assistant-ui/assistant-loading-indicator.tsx";
import {
  AssistantToolGroup,
  type AssistantToolPart,
} from "../assistant-ui/assistant-tool-group.tsx";
import { InteractiveParts } from "./InteractiveParts";

type AssistantContentPart =
  | { type: "text"; text: string }
  | ({ type: "tool-call" } & AssistantToolPart);

// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------
export const AssistantMessage: FC = () => {
  const message = useMessage();

  const content = ((message as unknown as { content?: AssistantContentPart[] }).content ?? []) as
    | AssistantContentPart[]
    | undefined;
  const textParts = useMemo(
    () =>
      (content ?? []).filter(
        (part): part is Extract<AssistantContentPart, { type: "text" }> =>
          part.type === "text",
      ),
    [content],
  );
  const toolParts = useMemo(
    () =>
      (content ?? []).filter(
        (part): part is Extract<AssistantContentPart, { type: "tool-call" }> =>
          part.type === "tool-call",
      ),
    [content],
  );

  return (
    <MessagePrimitive.Root
      className="relative mx-auto w-full max-w-3xl data-[role=assistant]:animate-in data-[role=assistant]:fade-in data-[role=assistant]:slide-in-from-bottom-1"
      data-role="assistant"
    >
      <div className="wrap-break-word px-2 text-foreground leading-relaxed">
        <AuiIf
          condition={(s) => s.message.status?.type === "running" && s.message.content.length === 0}
        >
          <AssistantLoadingIndicator />
        </AuiIf>

        {textParts.map((part, index) => (
          <AssistantMarkdownPart key={`text-${index}`} text={part.text} />
        ))}

        <AssistantToolGroup toolParts={toolParts} />

        <InteractiveParts />
      </div>
    </MessagePrimitive.Root>
  );
};
