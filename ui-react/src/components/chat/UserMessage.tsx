import {
  MessagePrimitive,
  ActionBarPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { PencilIcon, FileText, Image } from "lucide-react";
import { type FC, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useChatStore, type MessageAttachment } from "@/store/chat.store";

// ---------------------------------------------------------------------------
// UserMessage — read-only user bubble + edit affordance.
// Edit UI lives in UserEditComposer (see ThreadPrimitive.Messages components).
// ---------------------------------------------------------------------------
export const UserMessage: FC = () => {
  const message = useMessage();
  // Extract ID as a plain string during render — accessing the assistant-ui proxy
  // object inside a Zustand selector callback (which runs outside the React render
  // cycle) triggers tapClientLookup on a stale/rebuilding runtime state, causing
  // "Index N out of bounds (length: 0)" crashes.
  const messageId = message.id;

  // When the user message directly follows an interactive tool (question_flow /
  // option_list), its content is already shown in the QASummary card above.
  // Render a subtle "submitted" badge instead of the full bubble.
  const messages = useChatStore((s) => s.messages);
  const isPrecededByInteractiveTool = useMemo(() => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx <= 0) {
      return false;
    }
    // User reply may follow a *second* assistant bubble (e.g. <final> text after
    // question_flow). Walk backward across consecutive assistant rows.
    let j = idx - 1;
    while (j >= 0 && messages[j]!.role === "assistant") {
      if (
        messages[j]!.contentBlocks?.some(
          (b) => b.type === "interactive",
        )
      ) {
        return true;
      }
      j--;
    }
    return false;
  }, [messages, messageId]);

  if (isPrecededByInteractiveTool) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex justify-end py-1">
          <span className="text-xs text-muted-foreground/60 italic px-2">
            ✓ 已提交
          </span>
        </div>
      </div>
    );
  }

  return (
    <MessagePrimitive.Root className="group/msg mx-auto w-full max-w-3xl py-2" data-role="user">
      <div className="flex flex-col items-end gap-1.5">
        {/* File attachment tags — above the bubble, right-aligned */}
        <UserAttachments />

        <div className="flex items-center justify-end gap-2 w-full">
          {/* Edit action — fades in on hover */}
          <ActionBarPrimitive.Root hideWhenRunning autohide="always">
            <ActionBarPrimitive.Edit asChild>
              <button
                type="button"
                title="Edit message"
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg",
                  "text-muted-foreground transition-all duration-150",
                  "opacity-0 group-hover/msg:opacity-100",
                  "hover:bg-muted hover:text-foreground",
                )}
              >
                <PencilIcon className="size-3.5" />
              </button>
            </ActionBarPrimitive.Edit>
          </ActionBarPrimitive.Root>

          {/* Message bubble — text only */}
          <div
            className={cn(
              "max-w-[80%] rounded-3xl px-4 py-2.5 text-sm",
              "bg-secondary text-foreground",
            )}
          >
            <MessagePrimitive.Parts
              components={{ Text: UserText }}
            />
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const UserText: FC<{ text: string }> = ({ text }) => (
  <p className="whitespace-pre-wrap wrap-break-word">{text}</p>
);

// Stable empty array to avoid creating a new reference on every render
const EMPTY_ATTACHMENTS: MessageAttachment[] = [];

// Reads attachments from the Zustand store by matching the current message id,
// bypassing assistant-ui's attachment system (which has complex type requirements).
const UserAttachments: FC = () => {
  const message = useMessage();
  const attachments = useChatStore((s) => {
    const msg = s.messages.find((m) => m.id === message.id);
    return msg?.attachments ?? EMPTY_ATTACHMENTS;
  });

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {attachments.map((att) => (
        <UserAttachmentTag key={att.fileName} attachment={att} />
      ))}
    </div>
  );
};

const UserAttachmentTag: FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  const isImage = attachment.mimeType.startsWith("image/");
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
      {isImage ? (
        <Image className="size-3.5 shrink-0" />
      ) : (
        <FileText className="size-3.5 shrink-0" />
      )}
      <span className="truncate font-medium">{attachment.fileName}</span>
    </div>
  );
};
