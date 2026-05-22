import { type ReactNode } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import {
  CRON_MONTH_DAY_OPTIONS,
  CRON_WEEKDAY_OPTIONS,
} from "@/lib/cron-schedule-form";
import { cn } from "@/lib/utils";
import type { ScheduledTaskFormData } from "@/types/agents";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const scheduleLabelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-xs text-destructive">{message}</p>;
}

function ScheduleField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 shrink-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className={scheduleLabelClass}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export interface TaskFormScheduleFieldsProps {
  form: ScheduledTaskFormData;
  onFormChange: (patch: Partial<ScheduledTaskFormData>) => void;
  disabled?: boolean;
  fieldErrors?: { scheduleAt?: string; everyAmount?: string };
  preferredHour: string;
  preferredMinute: string;
  onPreferredHourChange: (hour: string) => void;
  onPreferredMinuteChange: (minute: string) => void;
  oneTimeDate: Date | undefined;
  oneTimeHour: string;
  oneTimeMinute: string;
  datePickerOpen: boolean;
  onDatePickerOpenChange: (open: boolean) => void;
  onOneTimeDateSelect: (date: Date | undefined) => void;
  onOneTimeHourChange: (hour: string) => void;
  onOneTimeMinuteChange: (minute: string) => void;
}

export function TaskFormScheduleFields({
  form,
  onFormChange,
  disabled = false,
  fieldErrors = {},
  preferredHour,
  preferredMinute,
  onPreferredHourChange,
  onPreferredMinuteChange,
  oneTimeDate,
  oneTimeHour,
  oneTimeMinute,
  datePickerOpen,
  onDatePickerOpenChange,
  onOneTimeDateSelect,
  onOneTimeHourChange,
  onOneTimeMinuteChange,
}: TaskFormScheduleFieldsProps) {
  const showTimePicker = ["daily", "weekly", "monthly"].includes(form.scheduleKind);
  const showWeeklyDay = form.scheduleKind === "weekly";
  const showMonthlyDay = form.scheduleKind === "monthly";
  const showEveryFields = form.scheduleKind === "every";
  const showOneTimeField = form.scheduleKind === "one-time";

  return (
    <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-0.5">
      <ScheduleField label="Schedule Type" htmlFor="task-schedule-kind" className="w-[11.5rem]">
        <Select
          value={form.scheduleKind}
          onValueChange={(v) =>
            onFormChange({ scheduleKind: v as ScheduledTaskFormData["scheduleKind"] })
          }
          disabled={disabled}
        >
          <SelectTrigger id="task-schedule-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="every">Every N minutes/hours/days</SelectItem>
            <SelectItem value="one-time">One-time</SelectItem>
          </SelectContent>
        </Select>
      </ScheduleField>

      {showWeeklyDay && (
        <ScheduleField label="Day of Week" className="w-[9.5rem]">
          <Select
            value={form.weeklyDayOfWeek}
            onValueChange={(v) => onFormChange({ weeklyDayOfWeek: v })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRON_WEEKDAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ScheduleField>
      )}

      {showMonthlyDay && (
        <ScheduleField label="Day of Month" className="w-[9.5rem]">
          <Select
            value={form.monthlyDayOfMonth}
            onValueChange={(v) => onFormChange({ monthlyDayOfMonth: v })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-48">
              {CRON_MONTH_DAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ScheduleField>
      )}

      {showTimePicker && (
        <ScheduleField label="Preferred Time" className="w-[8.75rem]">
          <div className="flex items-center gap-1.5">
            <Select
              value={preferredHour}
              onValueChange={onPreferredHourChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-20">
                <SelectValue placeholder="HH" />
              </SelectTrigger>
              <SelectContent position="popper" className="h-44 overflow-y-auto">
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="font-medium text-muted-foreground">:</span>
            <Select
              value={preferredMinute}
              onValueChange={onPreferredMinuteChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-20">
                <SelectValue placeholder="MM" />
              </SelectTrigger>
              <SelectContent position="popper" className="h-44 overflow-y-auto">
                {MINUTES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ScheduleField>
      )}

      {showOneTimeField && (
        <ScheduleField label="Run At" className="min-w-[17.5rem]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Popover open={datePickerOpen} onOpenChange={onDatePickerOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                      "w-[9.5rem] justify-start text-left font-normal",
                      !oneTimeDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4 shrink-0" />
                    {oneTimeDate ? format(oneTimeDate, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={oneTimeDate}
                    onSelect={onOneTimeDateSelect}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Select value={oneTimeHour} onValueChange={onOneTimeHourChange} disabled={disabled}>
                <SelectTrigger className="w-20">
                  <SelectValue placeholder="HH" />
                </SelectTrigger>
                <SelectContent position="popper" className="h-44 overflow-y-auto">
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="font-medium text-muted-foreground">:</span>

              <Select
                value={oneTimeMinute}
                onValueChange={onOneTimeMinuteChange}
                disabled={disabled}
              >
                <SelectTrigger className="w-20">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent position="popper" className="h-44 overflow-y-auto">
                  {MINUTES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FieldError message={fieldErrors.scheduleAt} />
          </div>
        </ScheduleField>
      )}

      {showEveryFields && (
        <>
          <ScheduleField label="Interval Amount" htmlFor="task-every-amount" className="w-[7.5rem]">
            <Input
              id="task-every-amount"
              type="number"
              min="1"
              placeholder="e.g. 30"
              value={form.everyAmount}
              onChange={(e) => onFormChange({ everyAmount: e.target.value })}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.everyAmount)}
            />
            <FieldError message={fieldErrors.everyAmount} />
          </ScheduleField>
          <ScheduleField label="Unit" htmlFor="task-every-unit" className="w-[7.5rem]">
            <Select
              value={form.everyUnit}
              onValueChange={(v) =>
                onFormChange({ everyUnit: v as ScheduledTaskFormData["everyUnit"] })
              }
              disabled={disabled}
            >
              <SelectTrigger id="task-every-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </ScheduleField>
        </>
      )}
    </div>
  );
}
