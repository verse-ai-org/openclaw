import {
  MessagePrimitive,
  ActionBarPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { CheckIcon, CopyIcon, FileText, Image, PencilIcon } from "lucide-react";
import { type FC, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/common/use-copy-to-clipboard.ts";
import type { MessageAttachment } from "@/components/chat/types";
import { useChatStore } from "@/store/chat.store";
import { useConversationStore } from "@/store/conversation.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveActiveChatSessionKey } from "./session/active-session";
import { selectChatMessages } from "@/store/conversation-selectors";
import { parseQaPairsFromMessage } from "./ui-tool/ui-qa-format";

// ---------------------------------------------------------------------------
// UserMessage — read-only user bubble + edit affordance.
// Edit UI lives in UserEditComposer (see ThreadPrimitive.Messages components).
// ---------------------------------------------------------------------------
function userMessageCopyText(storeContent: string | undefined, auiContent: unknown): string {
  if (typeof storeContent === "string" && storeContent.trim().length > 0) {
    return storeContent;
  }
  if (typeof auiContent === "string") {
    return auiContent;
  }
  if (Array.isArray(auiContent)) {
    const parts: string[] = [];
    for (const item of auiContent) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string"
      ) {
        parts.push((item as { text: string }).text);
      }
    }
    return parts.join("\n\n").trim();
  }
  return "";
}

export const UserMessage: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  const auiContent = useAuiState((s) => s.message.content);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = resolveActiveChatSessionKey(sessionKey, settingsSessionKey);
  const conversation = useConversationStore((s) => s.byThread[activeSessionKey]);
  const message = (() => {
    const messages = conversation ? selectChatMessages(conversation) : [];
    return messages.find((m) => m.id === messageId);
  })();

  const textToCopy = useMemo(
    () => userMessageCopyText(message?.content, auiContent),
    [message?.content, auiContent],
  );
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  const interaction = message?.metadata?.interaction;
  const isInteractionEcho =
    interaction?.status === "submitted" &&
    typeof interaction?.id === "string" &&
    interaction.id.length > 0 &&
    parseQaPairsFromMessage(message?.content ?? "").length > 0;

  // Hide the Q/A echo message completely (it's for model-driving only).
  if (isInteractionEcho) {
    return null;
  }

  return (
    <MessagePrimitive.Root className="group/msg mx-auto w-full max-w-(--thread-max-width) py-2" data-role="user">
      <div className="flex flex-col items-end gap-1.5">
        {/* File attachment tags — above the bubble, right-aligned */}
        <UserAttachments />

        <div className="flex max-w-[80%] flex-col items-stretch gap-1 self-end">
          {/* Message bubble — text only */}
          <div
            className={cn(
              "rounded-3xl px-4 py-2.5 text-sm",
              "bg-secondary text-foreground",
            )}
          >
            <MessagePrimitive.Parts components={{ Text: UserText }} />
          </div>

          {/* Edit + copy — below bubble, fades in on hover */}
          <div
            className={cn(
              "flex justify-end gap-2",
              "opacity-0 transition-all duration-150 group-hover/msg:opacity-100",
            )}
          >
            <ActionBarPrimitive.Root hideWhenRunning autohide="always">
              <ActionBarPrimitive.Edit asChild>
                <button
                  type="button"
                  title="Edit message"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg",
                    "text-muted-foreground",
                    "hover:bg-muted hover:text-foreground",
                  )}
                >
                  <PencilIcon className="size-3.5" />
                </button>
              </ActionBarPrimitive.Edit>
            </ActionBarPrimitive.Root>

            <button
              type="button"
              title={isCopied ? "Copied" : "Copy message"}
              disabled={!textToCopy}
              onClick={() => {
                if (!textToCopy || isCopied) {
                  return;
                }
                copyToClipboard(textToCopy);
              }}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg",
                "text-muted-foreground",
                "hover:bg-muted hover:text-foreground",
                "disabled:pointer-events-none disabled:opacity-30",
              )}
            >
              {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            </button>
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
  const messageId = useAuiState((s) => s.message.id);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = resolveActiveChatSessionKey(sessionKey, settingsSessionKey);
  const conversation = useConversationStore((s) => s.byThread[activeSessionKey]);
  const attachments = (() => {
    const messages = conversation ? selectChatMessages(conversation) : [];
    const msg = messages.find((m) => m.id === messageId);
    return msg?.attachments ?? EMPTY_ATTACHMENTS;
  })();

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
