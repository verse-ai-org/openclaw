import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { ScheduledTaskFormData } from "@/types/agents";

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

/** Returns a default datetime-local value 1 hour from now ("YYYY-MM-DDTHH:mm"). */
function defaultScheduleAt(): string {
  const d = new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_FORM: ScheduledTaskFormData = {
  name: "",
  scheduleKind: "daily",
  preferredTime: "08:00",
  everyAmount: "1",
  everyUnit: "hours",
  scheduleAt: defaultScheduleAt(),
  deliveryMode: "none",
  agentPrompt: "",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TaskFormModalProps {
  open: boolean;
  mode: "new" | "edit";
  initialData?: Partial<ScheduledTaskFormData>;
  saving?: boolean;
  onSave: (form: ScheduledTaskFormData) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskFormModal({
  open,
  mode,
  initialData,
  saving = false,
  onSave,
  onClose,
}: TaskFormModalProps) {
  const [form, setForm] = useState<ScheduledTaskFormData>({
    ...DEFAULT_FORM,
    ...initialData,
  });

  // Reset form when dialog opens with new initialData
  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, ...initialData });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSave() {
    if (!form.name.trim() || !form.agentPrompt.trim()) {
      return;
    }
    if (form.scheduleKind === "one-time" && !form.scheduleAt) {
      return;
    }
    if (form.scheduleKind === "every" && !(parseInt(form.everyAmount, 10) > 0)) {
      return;
    }
    onSave(form);
  }

  const isOneTimeValid =
    form.scheduleKind !== "one-time" || Boolean(form.scheduleAt);
  const isEveryValid =
    form.scheduleKind !== "every" || parseInt(form.everyAmount, 10) > 0;
  const isValid =
    form.name.trim().length > 0 &&
    form.agentPrompt.trim().length > 0 &&
    isOneTimeValid &&
    isEveryValid;

  const title = mode === "new" ? "New Scheduled Task" : "Edit Scheduled Task";
  const showTimePicker = ["daily", "weekly", "monthly"].includes(form.scheduleKind);
  const showEveryFields = form.scheduleKind === "every";
  const showOneTimeField = form.scheduleKind === "one-time";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Tasks run automatically on schedule and can be triggered manually anytime.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* Task Name */}
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
            />
          </div>

          {/* Schedule Kind */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-schedule-kind" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Schedule Type
              </Label>
              <Select
                value={form.scheduleKind}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, scheduleKind: v as ScheduledTaskFormData["scheduleKind"] }))
                }
                disabled={saving}
              >
                <SelectTrigger id="task-schedule-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly (Monday)</SelectItem>
                  <SelectItem value="monthly">Monthly (1st)</SelectItem>
                  <SelectItem value="every">Every N minutes/hours/days</SelectItem>
                  <SelectItem value="one-time">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preferred time (daily/weekly/monthly) */}
            {showTimePicker && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preferred Time
                </Label>
                <Input
                  id="task-time"
                  type="time"
                  value={form.preferredTime}
                  onChange={(e) => setForm((f) => ({ ...f, preferredTime: e.target.value }))}
                  disabled={saving}
                />
              </div>
            )}
          </div>

          {/* Every N interval */}
          {showEveryFields && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-every-amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Interval Amount
                </Label>
                <Input
                  id="task-every-amount"
                  type="number"
                  min="1"
                  placeholder="e.g. 30"
                  value={form.everyAmount}
                  onChange={(e) => setForm((f) => ({ ...f, everyAmount: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-every-unit" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Unit
                </Label>
                <Select
                  value={form.everyUnit}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, everyUnit: v as ScheduledTaskFormData["everyUnit"] }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="task-every-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* One-time: date + time picker */}
          {showOneTimeField && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-schedule-at" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Run At
              </Label>
              <Input
                id="task-schedule-at"
                type="datetime-local"
                value={form.scheduleAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduleAt: e.target.value }))}
                disabled={saving}
              />
            </div>
          )}

          {/* Agent Prompt */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-prompt" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agent Prompt
            </Label>
            <textarea
              id="task-prompt"
              rows={6}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Describe what the agent should do on each run…"
              value={form.agentPrompt}
              onChange={(e) => setForm((f) => ({ ...f, agentPrompt: e.target.value }))}
              disabled={saving}
            />
          </div>

          {/* Delivery Mode */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-delivery-mode" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Delivery Mode
            </Label>
            <Select
              value={form.deliveryMode}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, deliveryMode: v as ScheduledTaskFormData["deliveryMode"] }))
              }
              disabled={saving}
            >
              <SelectTrigger id="task-delivery-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No notification</SelectItem>
                <SelectItem value="announce">Announce to channel</SelectItem>
              </SelectContent>
            </Select>
            {form.deliveryMode === "announce" && (
              <p className="text-xs text-muted-foreground">
                Requires at least one messaging channel (e.g. Telegram, Discord) to be configured.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !isValid} className="min-w-[80px]">
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
