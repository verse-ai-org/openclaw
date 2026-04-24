import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ScheduledTaskFormData } from "@/types/agents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** HOURS options 00–23 */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
/** MINUTES options: 00–59 */
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

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

const DEFAULT_FORM: ScheduledTaskFormData = {
  name: "",
  scheduleKind: "daily",
  preferredTime: "08:00",
  everyAmount: "1",
  everyUnit: "hours",
  scheduleAt: "",           // populated from oneTimeDate + oneTimeHour + oneTimeMinute
  deliveryMode: "none",
  agentPrompt: "",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Describes a channel available for delivery selection. */
export type DeliveryChannelOption = {
  id: string;
  label: string;
};

interface TaskFormModalProps {
  open: boolean;
  mode: "new" | "edit";
  initialData?: Partial<ScheduledTaskFormData>;
  saving?: boolean;
  /** Whether at least one messaging channel is configured. Used to warn when announce mode is selected. */
  hasChannel?: boolean;
  /** List of available channels to choose from. When provided, shows a channel selector. */
  channelOptions?: DeliveryChannelOption[];
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
  hasChannel = true,
  channelOptions,
  onSave,
  onClose,
}: TaskFormModalProps) {
  const [form, setForm] = useState<ScheduledTaskFormData>({
    ...DEFAULT_FORM,
    ...initialData,
  });

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
      return isNaN(d.getTime()) ? new Date(Date.now() + 3_600_000) : d;
    }
    return new Date(Date.now() + 3_600_000);
  });
  const [oneTimeHour, setOneTimeHour] = useState<string>(() => {
    if (initialData?.scheduleAt) {
      const d = new Date(initialData.scheduleAt);
      return isNaN(d.getTime()) ? "09" : String(d.getHours()).padStart(2, "0");
    }
    return "09";
  });
  const [oneTimeMinute, setOneTimeMinute] = useState<string>(() => {
    if (initialData?.scheduleAt) {
      const d = new Date(initialData.scheduleAt);
      return isNaN(d.getTime()) ? "00" : String(d.getMinutes()).padStart(2, "0");
    }
    return "00";
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Reset form when dialog opens with new initialData
  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, ...initialData });
      const pt = initialData?.preferredTime ?? "08:00";
      setPreferredHour(pt.split(":")[0]);
      setPreferredMinute(pt.split(":")[1] ?? "00");
      if (initialData?.scheduleAt) {
        const d = new Date(initialData.scheduleAt);
        if (!isNaN(d.getTime())) {
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

  function handleSave() {
    if (!form.name.trim() || !form.agentPrompt.trim()) {
      return;
    }
    if (form.scheduleKind === "one-time" && !oneTimeDate) {
      return;
    }
    if (form.scheduleKind === "every" && !(parseInt(form.everyAmount, 10) > 0)) {
      return;
    }
    // Ensure scheduleAt is up to date before saving
    const finalForm: ScheduledTaskFormData =
      form.scheduleKind === "one-time"
        ? { ...form, scheduleAt: buildScheduleAt(oneTimeDate, oneTimeHour, oneTimeMinute) }
        : { ...form, preferredTime: `${preferredHour}:${preferredMinute}` };
    onSave(finalForm);
  }

  const isOneTimeValid = form.scheduleKind !== "one-time" || Boolean(oneTimeDate);
  const isEveryValid =
    form.scheduleKind !== "every" || parseInt(form.everyAmount, 10) > 0;
  const selectedDeliveryChannel =
    form.deliveryMode === "announce"
      ? form.deliveryChannel?.trim() || channelOptions?.[0]?.id
      : undefined;
  const isFeishuChannel = selectedDeliveryChannel === "feishu" || selectedDeliveryChannel === "lark";
  // openclaw-weixin requires an explicit deliveryTo
  const isWeixinChannel =
    form.deliveryMode === "announce" && selectedDeliveryChannel === "openclaw-weixin";
  const isDeliveryToValid = !isWeixinChannel || Boolean(form.deliveryTo?.trim());
  const isValid =
    form.name.trim().length > 0 &&
    form.agentPrompt.trim().length > 0 &&
    isOneTimeValid &&
    isEveryValid &&
    isDeliveryToValid;

  const title = mode === "new" ? "New Scheduled Task" : "Edit Scheduled Task";
  const showTimePicker = ["daily", "weekly", "monthly"].includes(form.scheduleKind);
  const showEveryFields = form.scheduleKind === "every";
  const showOneTimeField = form.scheduleKind === "one-time";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
      <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[90vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            The task will run automatically as scheduled, or it can be triggered manually at any
            time. Please describe the operation you want to perform periodically. Also you can
            create one quickly via chat.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2 overflow-y-auto flex-1 pr-1">
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

          {/* Schedule Kind row — always visible */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Schedule Type */}
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
                <SelectTrigger id="task-schedule-kind" className="w-52">
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

            {/* Preferred Time (daily/weekly/monthly) — inline, right of Schedule Type */}
            {showTimePicker && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preferred Time
                </Label>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={preferredHour}
                    onValueChange={handlePreferredHourChange}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="HH" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="h-44 overflow-y-auto">
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground font-medium">:</span>
                  <Select
                    value={preferredMinute}
                    onValueChange={handlePreferredMinuteChange}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="h-44 overflow-y-auto">
                      {MINUTES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* One-time: Run At — inline, right of Schedule Type */}
            {showOneTimeField && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Run At
                </Label>
                <div className="flex items-center gap-2">
                  {/* Date picker */}
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={saving}
                        className={cn(
                          "w-40 justify-start text-left font-normal",
                          !oneTimeDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 size-4 shrink-0" />
                        {oneTimeDate
                          ? format(oneTimeDate, "MMM d, yyyy")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={oneTimeDate}
                        onSelect={handleOneTimeDateSelect}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Hour select */}
                  <Select
                    value={oneTimeHour}
                    onValueChange={handleOneTimeHourChange}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="HH" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="h-44 overflow-y-auto">
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-muted-foreground font-medium">:</span>

                  {/* Minute select */}
                  <Select
                    value={oneTimeMinute}
                    onValueChange={handleOneTimeMinuteChange}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="h-44 overflow-y-auto">
                      {MINUTES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

          {/* One-time Run At block removed — now inline with Schedule Type above */}

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
              <p className={cn(
                "text-xs",
                hasChannel ? "text-muted-foreground" : "text-destructive font-medium",
              )}>
                {hasChannel
                  ? "Requires at least one messaging channel (e.g. Telegram, Discord) to be configured."
                  : "⚠️ No messaging channel detected. The task will still be created but delivery will be silently downgraded to None until a channel is connected."}
              </p>
            )}
          </div>

          {/* Channel selector — shown when announce mode is on and channelOptions are available */}
          {form.deliveryMode === "announce" && channelOptions && channelOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-delivery-channel" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Delivery Channel
              </Label>
              <Select
                value={form.deliveryChannel ?? "__auto__"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    deliveryChannel: v === "__auto__" ? undefined : v,
                    deliveryTo: "",
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger id="task-delivery-channel">
                  <SelectValue placeholder="Auto (first configured)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (first configured)</SelectItem>
                  {channelOptions.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* deliveryTo — weixin required, feishu optional */}
          {form.deliveryMode === "announce" && (isWeixinChannel || isFeishuChannel) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-delivery-to" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recipient ID {isWeixinChannel ? <span className="text-destructive">*</span> : null}
              </Label>
              <Input
                id="task-delivery-to"
                type="password"
                autoComplete="off"
                placeholder={
                  isWeixinChannel
                    ? "e.g. wxid_xxxxx@im.wechat"
                    : "e.g. user:ou_xxx (optional)"
                }
                value={form.deliveryTo ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, deliveryTo: e.target.value.trim() }))}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {isWeixinChannel
                  ? "WeChat user ID (ends with @im.wechat). Required for openclaw-weixin delivery."
                  : "Feishu recipient is optional. Leave empty to auto-resolve from session identity hints when available."}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 shrink-0 border-t mt-2">
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
