import { PlusIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface NewTaskCardProps {
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function NewTaskCard({ onClick }: NewTaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-card p-5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-current">
        <PlusIcon className="size-5" />
      </div>
      <span className="text-sm font-medium">Create New Task</span>
    </button>
  );
}
