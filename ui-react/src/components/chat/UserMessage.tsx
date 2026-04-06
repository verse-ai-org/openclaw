import {
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
} from "@assistant-ui/react";
import { PencilIcon, CheckIcon, XIcon } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// UserMessage — renders user bubbles with inline edit support
// ---------------------------------------------------------------------------
export const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group/msg mx-auto w-full max-w-3xl py-2" data-role="user">
      {/* Normal view: shown when NOT in edit mode */}
      <ComposerPrimitive.If editing={false}>
        <div className="flex items-end justify-end gap-2">
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

          {/* Message bubble */}
          <div
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
              "bg-foreground text-background",
            )}
          >
            <MessagePrimitive.Attachments
              components={{ Attachment: UserAttachment }}
            />
            <MessagePrimitive.Parts
              components={{ Text: UserText }}
            />
          </div>
        </div>
      </ComposerPrimitive.If>

      {/* Edit mode: shown when user clicked the pencil icon */}
      <ComposerPrimitive.If editing>
        <div className="flex justify-end">
          <div className="w-full max-w-[80%]">
            <ComposerPrimitive.Root className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-card px-3 py-2.5 shadow-sm">
              <ComposerPrimitive.Input
                className={cn(
                  "w-full resize-none bg-transparent text-sm text-foreground",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none",
                  "min-h-[2rem] max-h-40",
                )}
                rows={1}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                {/* Cancel — restores original message without re-sending */}
                <ComposerPrimitive.Cancel asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                      "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                    )}
                  >
                    <XIcon className="size-3" />
                    Cancel
                  </button>
                </ComposerPrimitive.Cancel>

                {/* Send — submits edit → calls onEdit in GatewayChatRuntimeProvider */}
                <ComposerPrimitive.Send asChild>
                  <button
                    type="submit"
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                      "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                    )}
                  >
                    <CheckIcon className="size-3" />
                    Save &amp; Send
                  </button>
                </ComposerPrimitive.Send>
              </div>
            </ComposerPrimitive.Root>
          </div>
        </div>
      </ComposerPrimitive.If>
    </MessagePrimitive.Root>
  );
};

const UserText: FC<{ text: string }> = ({ text }) => (
  <p className="whitespace-pre-wrap wrap-break-word">{text}</p>
);

const UserAttachment: FC = () => (
  <div className="mb-2">
    <MessagePrimitive.Attachments components={undefined} />
  </div>
);
