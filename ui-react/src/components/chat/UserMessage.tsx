import { MessagePrimitive } from "@assistant-ui/react";
import type { FC } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// UserMessage
// ---------------------------------------------------------------------------
export const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="mx-auto w-full max-w-3xl py-2" data-role="user">
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
            "bg-primary text-primary-foreground",
          )}
        >
          {/* Attachments (images) */}
          <MessagePrimitive.Attachments
            components={{
              Attachment: UserAttachment,
            }}
          />
          {/* Text content */}
          <MessagePrimitive.Parts
            components={{
              Text: UserText,
            }}
          />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const UserText: FC<{ text: string }> = ({ text }) => (
  <p className="whitespace-pre-wrap wrap-break-word">{text}</p>
);

const UserAttachment: FC = () => (
  // Render image attachments above the message text
  <div className="mb-2">
    <MessagePrimitive.Attachments components={undefined} />
  </div>
);
