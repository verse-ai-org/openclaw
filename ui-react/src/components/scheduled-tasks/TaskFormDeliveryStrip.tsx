import { useMemo, useState } from "react";
import { BellOffIcon, LinkIcon, PlusIcon, WebhookIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskFormAddDeliveryDialog } from "@/components/scheduled-tasks/TaskFormAddDeliveryDialog";
import {
  applyDeliverySelectionToForm,
  deliverySelectionFromFormData,
  describeDeliveryTarget,
  type DeliveryChannelOption,
  type TaskDeliverySelection,
} from "@/lib/cron-delivery-form";
import { normalizeDeliveryChannelId } from "@/lib/delivery-channel-options";
import { getChannelLogoUrl } from "@/components/channels/shared/channel-logos";
import { MessageSquareIcon } from "lucide-react";
import type { ChannelRecipientEntry, CronJob, ScheduledTaskFormData } from "@/types/agents";

function channelLabelMap(options: DeliveryChannelOption[]): Record<string, string> {
  return Object.fromEntries(options.map((o) => [o.id, o.label]));
}

function DeliveryAvatar({
  selection,
  channelOptions,
}: {
  selection: TaskDeliverySelection;
  channelOptions: DeliveryChannelOption[];
}) {
  if (selection.kind === "none") {
    return (
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BellOffIcon className="size-6" aria-hidden="true" />
      </span>
    );
  }
  if (selection.kind === "webhook") {
    return (
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-primary">
        <WebhookIcon className="size-6" aria-hidden="true" />
      </span>
    );
  }
  const channelId = normalizeDeliveryChannelId(selection.channel, channelOptions);
  const option = channelOptions.find((o) => o.id === channelId);
  const logoUrl =
    (channelId ? getChannelLogoUrl(channelId) : "") || option?.systemImage;

  return (
    <span className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted p-2.5">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-contain" />
      ) : (
        <MessageSquareIcon className="size-7 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

interface TaskFormDeliveryStripProps {
  form: ScheduledTaskFormData;
  channelOptions: DeliveryChannelOption[];
  channelRecipients?: ChannelRecipientEntry[];
  channelRecipientsLoading?: boolean;
  channelRecipientsError?: string | null;
  cronJobs?: CronJob[];
  hasChannel: boolean;
  disabled?: boolean;
  onReloadRecipients?: (options?: { force?: boolean }) => Promise<boolean>;
  onFormChange: (patch: Partial<ScheduledTaskFormData>) => void;
}

export function TaskFormDeliveryStrip({
  form,
  channelOptions,
  channelRecipients,
  channelRecipientsLoading = false,
  channelRecipientsError = null,
  cronJobs = [],
  hasChannel,
  disabled = false,
  onReloadRecipients,
  onFormChange,
}: TaskFormDeliveryStripProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");

  const selection = useMemo(() => deliverySelectionFromFormData(form), [form]);
  const channelLabelById = useMemo(
    () => channelLabelMap(channelOptions),
    [channelOptions],
  );
  const hasTarget = selection.kind !== "none";

  function applySelection(next: TaskDeliverySelection) {
    onFormChange(applyDeliverySelectionToForm(next));
  }

  function openAddDialog() {
    setDialogMode("add");
    setDialogOpen(true);
  }

  function openEditDialog() {
    setDialogMode("edit");
    setDialogOpen(true);
  }

  function handleDialogSave(target: Exclude<TaskDeliverySelection, { kind: "none" }>) {
    applySelection(target);
  }

  const targetDescription =
    selection.kind !== "none"
      ? describeDeliveryTarget(selection, channelLabelById)
      : null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Choose where to send results after each run (optional).
        </p>
        <div className="flex items-start gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => applySelection({ kind: "none" })}
            className={cn(
              "flex shrink-0 flex-col items-center gap-2 rounded-xl p-2 transition-colors",
              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <span
              className={cn(
                "ring-offset-2 ring-offset-background",
                selection.kind === "none"
                  ? "ring-2 ring-primary rounded-full"
                  : "ring-1 ring-border rounded-full",
              )}
            >
              <DeliveryAvatar
                selection={{ kind: "none" }}
                channelOptions={channelOptions}
              />
            </span>
            <span
              className={cn(
                "max-w-[5.5rem] truncate text-center text-xs font-medium",
                selection.kind === "none" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              None
            </span>
          </button>

          {hasTarget && targetDescription ? (
            <div className="relative shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={openEditDialog}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl p-2 pr-3 transition-colors",
                  "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                <span className="ring-2 ring-primary ring-offset-2 ring-offset-background rounded-full">
                  <DeliveryAvatar
                    selection={selection}
                    channelOptions={channelOptions}
                  />
                </span>
                <span className="max-w-[6.5rem] truncate text-center text-xs font-medium text-foreground">
                  {targetDescription.title}
                </span>
                {targetDescription.subtitle ? (
                  <span className="max-w-[6.5rem] truncate text-center text-[10px] text-muted-foreground -mt-1">
                    {targetDescription.subtitle}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label="Remove delivery target"
                onClick={(e) => {
                  e.stopPropagation();
                  applySelection({ kind: "none" });
                }}
                className={cn(
                  "absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full",
                  "border border-border bg-background text-muted-foreground shadow-sm",
                  "hover:bg-destructive hover:text-destructive-foreground",
                )}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            disabled={disabled}
            onClick={openAddDialog}
            className={cn(
              "flex shrink-0 flex-col items-center gap-2 rounded-xl p-2 transition-colors",
              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <span className="flex size-14 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-muted-foreground">
              <PlusIcon className="size-6" aria-hidden="true" />
            </span>
            <span className="max-w-[5.5rem] truncate text-center text-xs font-medium text-muted-foreground">
              Add
            </span>
          </button>
        </div>

        {!hasChannel && !hasTarget ? (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <LinkIcon className="size-3.5 shrink-0 mt-0.5" />
            Connect a messaging channel for announce delivery, or add a webhook.
          </p>
        ) : null}
      </div>

      <TaskFormAddDeliveryDialog
        open={dialogOpen}
        mode={dialogMode}
        initial={selection}
        channelOptions={channelOptions}
        channelRecipients={channelRecipients}
        channelRecipientsLoading={channelRecipientsLoading}
        channelRecipientsError={channelRecipientsError}
        cronJobs={cronJobs}
        hasChannel={hasChannel}
        disabled={disabled}
        onReloadRecipients={onReloadRecipients}
        onClose={() => setDialogOpen(false)}
        onSave={handleDialogSave}
      />
    </>
  );
}
