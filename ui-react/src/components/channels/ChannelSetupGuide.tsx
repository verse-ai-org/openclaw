import { CheckCircle2Icon, CircleIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveCurrentSetupStepIndex,
  type ChannelSetupStep,
} from "@/lib/channel-setup";

export function ChannelSetupGuide({
  steps,
  docsUrl,
}: {
  steps: ChannelSetupStep[];
  docsUrl?: string;
}) {
  if (steps.length === 0) {
    return null;
  }

  const currentIndex = resolveCurrentSetupStepIndex(steps);
  const allDone = steps.every((step) => step.done);

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-500/10 px-4 py-4 dark:border-amber-500/25 dark:bg-amber-500/10 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {allDone ? "Setup complete" : "Setup checklist"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allDone
              ? "Save any remaining changes, then confirm the channel shows Running on the list."
              : "Work through each step in order."}
          </p>
        </div>
        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Docs <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const isCurrent = !allDone && index === currentIndex;
          return (
            <li
              key={step.id}
              className={cn(
                "flex gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                step.done && "border-border/60 bg-background/50",
                isCurrent && "border-amber-400/80 bg-background shadow-sm dark:border-amber-500/40",
                !step.done && !isCurrent && "border-transparent bg-background/30",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleIcon
                    className={cn(
                      "size-4",
                      isCurrent ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                    )}
                  />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
