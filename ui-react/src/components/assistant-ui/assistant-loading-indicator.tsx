import { type FC } from "react";

export const AssistantLoadingIndicator: FC = () => {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
      <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
    </span>
  );
};
