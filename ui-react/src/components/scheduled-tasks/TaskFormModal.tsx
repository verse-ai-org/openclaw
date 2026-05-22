import { useEffect, useState, type ReactNode } from "react";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_SCHEDULED_TASK_FORM } from "@/lib/cron-job-form";
import {
  deliverySelectionFromFormData,
  isWeixinDeliveryChannel,
  validateDeliveryDialogDraft,
} from "@/lib/cron-delivery-form";
import type { DeliveryChannelOption } from "@/lib/cron-delivery-form";
import { buildAnnounceRecipientSuggestions } from "@/lib/cron-delivery-suggestions";
import { normalizeDeliveryChannelId } from "@/lib/delivery-channel-options";
import type { CronJob } from "@/types/agents";
import { TaskFormAgentPicker } from "@/components/scheduled-tasks/TaskFormAgentPicker";
import { TaskFormDeliveryStrip } from "@/components/scheduled-tasks/TaskFormDeliveryStrip";
import { TaskFormScheduleFields } from "@/components/scheduled-tasks/TaskFormScheduleFields";
import type {
  ChannelRecipientEntry,
  GatewayAgentRow,
  ScheduledTaskFormData,
} from "@/types/agents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a timezone-aware ISO string from a Date + HH + mm.
 * e.g. "2026-04-12T21:12:00+08:00" for Asia/Shanghai.
 */
function buildLocalIso(date: Date, hh: string, mm: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset(); // +480 for UTC+8
  const sign = offsetMin >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const om = pad(Math.abs(offsetMin) % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${hh}:${mm}:00${sign}${oh}:${om}`
  );
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

type FormFieldErrors = {
  name?: string;
  agentPrompt?: string;
  scheduleAt?: string;
  everyAmount?: string;
  deliveryTo?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-xs text-destructive">{message}</p>;
}

function FormSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      {title ? (
        <div className="flex items-center">
          <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          <div className="h-px min-h-px flex-1 bg-border" />
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type { DeliveryChannelOption } from "@/lib/cron-delivery-form";

interface TaskFormModalProps {
  open: boolean;
  mode: "new" | "edit";
  initialData?: Partial<ScheduledTaskFormData>;
  saving?: boolean;
  defaultAgentId?: string;
  agents?: GatewayAgentRow[];
  /** Whether at least one messaging channel is configured. Used to warn when announce mode is selected. */
  hasChannel?: boolean;
  /** List of available channels to choose from. When provided, shows a channel selector. */
  channelOptions?: DeliveryChannelOption[];
  /** Known channel recipients from session identity hints (for auto-complete). */
  channelRecipients?: ChannelRecipientEntry[];
  channelRecipientsLoading?: boolean;
  channelRecipientsError?: string | null;
  cronJobs?: CronJob[];
  onReloadChannelRecipients?: (options?: { force?: boolean }) => Promise<boolean>;
  onSave: (form: ScheduledTaskFormData) => void;
  onClose: () => void;
}

function buildDefaultForm(
  defaultAgentId: string,
  initialData?: Partial<ScheduledTaskFormData>,
): ScheduledTaskFormData {
  return {
    ...DEFAULT_SCHEDULED_TASK_FORM,
    agentId: defaultAgentId,
    ...initialData,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskFormModal({
  open,
  mode,
  initialData,
  saving = false,
  defaultAgentId = "main",
  agents = [],
  hasChannel = true,
  channelOptions,
  channelRecipients,
  channelRecipientsLoading = false,
  channelRecipientsError = null,
  cronJobs = [],
  onReloadChannelRecipients,
  onSave,
  onClose,
}: TaskFormModalProps) {
  const [form, setForm] = useState<ScheduledTaskFormData>(() =>
    buildDefaultForm(defaultAgentId, initialData),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Preferred time: split into hour + minute selects ────────────────────
  const [preferredHour, setPreferredHour] = useState<string>(
    () => (initialData?.preferredTime ?? "08:00").split(":")[0],
  );
  const [preferredMinute, setPreferredMinute] = useState<string>(
    () => (initialData?.preferredTime ?? "08:00").split(":")[1] ?? "00",
  );

  // ── One-time: Calendar date + hour/minute selects ───────────────────────
  const [oneTimeDate, setOneTimeDate] = useState<Date | undefined>(() => {
    // If editing an existing one-time job, try to restore the date
    if (initialData?.scheduleAt) {
      const d = new Date(initialData.scheduleAt);
      return Number.isNaN(d.getTime()) ? new Date(Date.now() + 3_600_000) : d;
    }
    return new Date(Date.now() + 3_600_000);
  });
  const [oneTimeHour, setOneTimeHour] = useState<string>(() => {
    if (initialData?.scheduleAt) {
      const d = new Date(initialData.scheduleAt);
      return Number.isNaN(d.getTime()) ? "09" : String(d.getHours()).padStart(2, "0");
    }
    return "09";
  });
  const [oneTimeMinute, setOneTimeMinute] = useState<string>(() => {
    if (initialData?.scheduleAt) {
      const d = new Date(initialData.scheduleAt);
      return Number.isNaN(d.getTime()) ? "00" : String(d.getMinutes()).padStart(2, "0");
    }
    return "00";
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Reset form when dialog opens with new initialData
  useEffect(() => {
    if (open) {
      setSubmitAttempted(false);
      setForm(buildDefaultForm(defaultAgentId, initialData));
      setAdvancedOpen(
        Boolean(
          initialData?.description?.trim() ||
            initialData?.sessionTarget === "main" ||
            initialData?.wakeMode === "now",
        ),
      );
      const pt = initialData?.preferredTime ?? "08:00";
      setPreferredHour(pt.split(":")[0]);
      setPreferredMinute(pt.split(":")[1] ?? "00");
      if (initialData?.scheduleAt) {
        const d = new Date(initialData.scheduleAt);
        if (!Number.isNaN(d.getTime())) {
          setOneTimeDate(d);
          setOneTimeHour(String(d.getHours()).padStart(2, "0"));
          setOneTimeMinute(String(d.getMinutes()).padStart(2, "0"));
        }
      } else {
        const d = new Date(Date.now() + 3_600_000);
        setOneTimeDate(d);
        setOneTimeHour(String(d.getHours()).padStart(2, "0"));
        setOneTimeMinute(String(d.getMinutes()).padStart(2, "0"));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Sync preferredTime string into form whenever hour/minute change */
  function handlePreferredHourChange(h: string) {
    setPreferredHour(h);
    setForm((f) => ({ ...f, preferredTime: `${h}:${preferredMinute}` }));
  }
  function handlePreferredMinuteChange(m: string) {
    setPreferredMinute(m);
    setForm((f) => ({ ...f, preferredTime: `${preferredHour}:${m}` }));
  }

  /** Build scheduleAt (timezone-aware ISO string) from Calendar date + selects */
  function buildScheduleAt(date: Date | undefined, h: string, m: string): string {
    if (!date) { return ""; }
    return buildLocalIso(date, h, m);
  }

  function handleOneTimeDateSelect(d: Date | undefined) {
    setOneTimeDate(d);
    setForm((f) => ({ ...f, scheduleAt: buildScheduleAt(d, oneTimeHour, oneTimeMinute) }));
    // Keep picker open so user can also set time
    if (d) { setDatePickerOpen(false); }
  }
  function handleOneTimeHourChange(h: string) {
    setOneTimeHour(h);
    setForm((f) => ({ ...f, scheduleAt: buildScheduleAt(oneTimeDate, h, oneTimeMinute) }));
  }
  function handleOneTimeMinuteChange(m: string) {
    setOneTimeMinute(m);
    setForm((f) => ({ ...f, scheduleAt: buildScheduleAt(oneTimeDate, oneTimeHour, m) }));
  }

  const showAgentPicker = agents.length > 0;

  function buildFieldErrors(): FormFieldErrors {
    const errors: FormFieldErrors = {};
    if (!form.name.trim()) {
      errors.name = "Task name is required.";
    }
    if (!form.agentPrompt.trim()) {
      errors.agentPrompt = "Agent prompt is required.";
    }
    if (form.scheduleKind === "one-time" && !oneTimeDate) {
      errors.scheduleAt = "Pick a date and time for the one-time run.";
    }
    if (form.scheduleKind === "every" && !(Number.parseInt(form.everyAmount, 10) > 0)) {
      errors.everyAmount = "Enter an interval greater than zero.";
    }
    const delivery = deliverySelectionFromFormData(form);
    if (delivery.kind !== "none") {
      const announceChannel =
        delivery.kind === "announce"
          ? normalizeDeliveryChannelId(delivery.channel, channelOptions ?? [])
          : "";
      const announceSuggestions =
        delivery.kind === "announce" && announceChannel
          ? buildAnnounceRecipientSuggestions({
              channelRecipients: channelRecipients ?? [],
              cronJobs,
              effectiveChannel: announceChannel,
            })
          : [];
      const deliveryErrors = validateDeliveryDialogDraft(delivery, {
        isWeixinChannel:
          delivery.kind === "announce"
            ? isWeixinDeliveryChannel(announceChannel)
            : false,
        hasRecipientSuggestions: announceSuggestions.length > 0,
      });
      if (deliveryErrors.deliveryTo) {
        errors.deliveryTo = deliveryErrors.deliveryTo;
      }
    }
    return errors;
  }

  const fieldErrors = submitAttempted ? buildFieldErrors() : {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  function handleSave() {
    setSubmitAttempted(true);
    const errors = buildFieldErrors();
    if (Object.keys(errors).length > 0) {
      return;
    }
    const finalForm: ScheduledTaskFormData =
      form.scheduleKind === "one-time"
        ? { ...form, scheduleAt: buildScheduleAt(oneTimeDate, oneTimeHour, oneTimeMinute) }
        : { ...form, preferredTime: `${preferredHour}:${preferredMinute}` };
    onSave(finalForm);
  }

  const title = mode === "new" ? "New Task" : "Edit Task";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
      <DialogContent
        className="flex max-h-[90vh] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 gap-2 px-6 pt-6 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            The task will run automatically as scheduled, or it can be triggered manually at any
            time. You can also create one quickly via chat.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 px-6 pb-4 pt-2">
          {/* 1. Task basics */}
          <FormSection>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Task Name
              </Label>
              <Input
                id="task-name"
                placeholder="e.g. Morning Architectural Digest"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              <FieldError message={fieldErrors.name} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-prompt" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agent Prompt
              </Label>
              <textarea
                id="task-prompt"
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Describe the operation you want to perform periodically. e.g. 'Send a daily report to the team.'"
                value={form.agentPrompt}
                onChange={(e) => setForm((f) => ({ ...f, agentPrompt: e.target.value }))}
                disabled={saving}
                aria-invalid={Boolean(fieldErrors.agentPrompt)}
              />
              <FieldError message={fieldErrors.agentPrompt} />
            </div>
          </FormSection>

          {/* 2. Schedule */}
          <FormSection>
            <TaskFormScheduleFields
              form={form}
              onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              disabled={saving}
              fieldErrors={{
                scheduleAt: fieldErrors.scheduleAt,
                everyAmount: fieldErrors.everyAmount,
              }}
              preferredHour={preferredHour}
              preferredMinute={preferredMinute}
              onPreferredHourChange={handlePreferredHourChange}
              onPreferredMinuteChange={handlePreferredMinuteChange}
              oneTimeDate={oneTimeDate}
              oneTimeHour={oneTimeHour}
              oneTimeMinute={oneTimeMinute}
              datePickerOpen={datePickerOpen}
              onDatePickerOpenChange={setDatePickerOpen}
              onOneTimeDateSelect={handleOneTimeDateSelect}
              onOneTimeHourChange={handleOneTimeHourChange}
              onOneTimeMinuteChange={handleOneTimeMinuteChange}
            />
          </FormSection>

          {/* 3. Assignee */}
          {showAgentPicker && (
            <FormSection>
              <TaskFormAgentPicker
                agents={agents}
                selectedAgentId={form.agentId}
                defaultAgentId={defaultAgentId}
                disabled={saving}
                onSelect={(agentId) => setForm((f) => ({ ...f, agentId }))}
              />
            </FormSection>
          )}

          {/* 4. Delivery */}
          <FormSection>
            <TaskFormDeliveryStrip
              form={form}
              channelOptions={channelOptions ?? []}
              channelRecipients={channelRecipients}
              channelRecipientsLoading={channelRecipientsLoading}
              channelRecipientsError={channelRecipientsError}
              cronJobs={cronJobs}
              hasChannel={hasChannel}
              disabled={saving}
              onReloadRecipients={onReloadChannelRecipients}
              onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
            <FieldError message={fieldErrors.deliveryTo} />
          </FormSection>

          {/* 5. Advanced */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="px-0!" asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between px-0 font-semibold text-xs uppercase tracking-wider text-muted-foreground hover:bg-transparent"
              >
                Advanced
                <ChevronDownIcon
                  className={cn(
                    "size-4 transition-transform",
                    advancedOpen && "rotate-180",
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="task-description"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Description (optional)
                </Label>
                <Input
                  id="task-description"
                  placeholder="Short note shown in task lists"
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="task-session-target"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Session target
                  </Label>
                  <Select
                    value={form.sessionTarget}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        sessionTarget: v as ScheduledTaskFormData["sessionTarget"],
                      }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger id="task-session-target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="isolated">Isolated (new session per run)</SelectItem>
                      <SelectItem value="main">Main agent session</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="task-wake-mode"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Wake mode
                  </Label>
                  <Select
                    value={form.wakeMode}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        wakeMode: v as ScheduledTaskFormData["wakeMode"],
                      }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger id="task-wake-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="next-heartbeat">Next heartbeat</SelectItem>
                      <SelectItem value="now">Wake now</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Controls how soon the gateway schedules the agent run after the cron fires.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col gap-2 border-t px-6 pb-6 pt-4">
          {submitAttempted && hasFieldErrors && (
            <p className="text-xs text-destructive text-right">
              Fix the highlighted fields before saving.
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[80px]">
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : "Save"}
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
