import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScheduledTasksEmptyStateProps {
  onCreate: () => void;
  onCreateWithChat: () => void;
}

export function ScheduledTasksEmptyState({
  onCreate,
  onCreateWithChat,
}: ScheduledTasksEmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 flex flex-col items-center gap-4 text-center">
      <p className="text-base font-semibold text-foreground">No scheduled tasks yet</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Create a task to run an agent on a schedule, or use chat to describe what you want and
        let the assistant set it up for you.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={onCreate} className="gap-1.5 rounded-full">
          <PlusIcon className="size-3.5" />
          New Scheduled Task
        </Button>
        <Button size="sm" variant="outline" onClick={onCreateWithChat} className="gap-1.5 rounded-full">
          <MessageSquareIcon className="size-3.5" />
          Create With Chat
        </Button>
      </div>
    </div>
  );
}
