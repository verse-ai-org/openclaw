import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type TaskDeliverySelection,
  isWeixinDeliveryChannel,
  validateDeliveryDialogDraft,
} from "@/lib/cron-delivery-form";
import { normalizeDeliveryChannelId } from "@/lib/delivery-channel-options";
import { ChannelOptionLabel } from "@/components/channels/shared/ChannelOptionLabel";
import {
  buildAnnounceRecipientSuggestions,
  buildWebhookUrlSuggestions,
} from "@/lib/cron-delivery-suggestions";
import type { ChannelRecipientEntry, CronJob } from "@/types/agents";
import type { DeliveryChannelOption } from "@/lib/cron-delivery-form";

type AnnounceDraft = Extract<TaskDeliverySelection, { kind: "announce" }>;
type WebhookDraft = Extract<TaskDeliverySelection, { kind: "webhook" }>;

function defaultAnnounceDraft(channelOptions: DeliveryChannelOption[]): AnnounceDraft {
  return {
    kind: "announce",
    channel: normalizeDeliveryChannelId(undefined, channelOptions),
    to: "",
    accountId: "",
    bestEffort: false,
  };
}

interface TaskFormAddDeliveryDialogProps {
  open: boolean;
  mode: "add" | "edit";
  initial: TaskDeliverySelection;
  channelOptions: DeliveryChannelOption[];
  channelRecipients?: ChannelRecipientEntry[];
  channelRecipientsLoading?: boolean;
  channelRecipientsError?: string | null;
  cronJobs?: CronJob[];
  hasChannel: boolean;
  disabled?: boolean;
  onReloadRecipients?: (options?: { force?: boolean }) => Promise<boolean>;
  onClose: () => void;
  onSave: (selection: Exclude<TaskDeliverySelection, { kind: "none" }>) => void;
}

export function TaskFormAddDeliveryDialog({
  open,
  mode,
  initial,
  channelOptions,
  channelRecipients,
  channelRecipientsLoading = false,
  channelRecipientsError = null,
  cronJobs = [],
  hasChannel,
  disabled = false,
  onReloadRecipients,
  onClose,
  onSave,
}: TaskFormAddDeliveryDialogProps) {
  const [tab, setTab] = useState<"announce" | "webhook">("announce");
  const [announceDraft, setAnnounceDraft] = useState<AnnounceDraft>(() =>
    defaultAnnounceDraft(channelOptions),
  );
  const [webhookDraft, setWebhookDraft] = useState<WebhookDraft>({ kind: "webhook", url: "" });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const recipientListId = useId();
  const dialogOpenRef = useRef(false);
  const recipientsPrimedOnOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      dialogOpenRef.current = false;
      recipientsPrimedOnOpenRef.current = false;
      return;
    }
    if (dialogOpenRef.current) {
      return;
    }
    dialogOpenRef.current = true;
    setSubmitAttempted(false);
    if (initial.kind === "webhook") {
      setTab("webhook");
      setWebhookDraft({ kind: "webhook", url: initial.url });
      setAnnounceDraft(defaultAnnounceDraft(channelOptions));
    } else if (initial.kind === "announce") {
      setTab("announce");
      setAnnounceDraft({
        ...initial,
        channel: normalizeDeliveryChannelId(initial.channel, channelOptions),
      });
      setWebhookDraft({ kind: "webhook", url: "" });
    } else {
      setTab(hasChannel ? "announce" : "webhook");
      setAnnounceDraft(defaultAnnounceDraft(channelOptions));
      setWebhookDraft({ kind: "webhook", url: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync draft only when dialog opens
  }, [open, initial, hasChannel]);

  useEffect(() => {
    if (!open || tab !== "announce" || !onReloadRecipients) {
      return;
    }
    if (recipientsPrimedOnOpenRef.current) {
      return;
    }
    if ((channelRecipients?.length ?? 0) > 0) {
      recipientsPrimedOnOpenRef.current = true;
      return;
    }
    recipientsPrimedOnOpenRef.current = true;
    void onReloadRecipients();
  }, [open, tab, channelRecipients?.length, onReloadRecipients]);

  const channelSelectValue =
    announceDraft.channel && channelOptions.some((o) => o.id === announceDraft.channel)
      ? announceDraft.channel
      : (channelOptions[0]?.id ?? "");
  const isWeixinChannel = isWeixinDeliveryChannel(channelSelectValue);
  const isFeishuChannel =
    channelSelectValue === "feishu" || channelSelectValue === "lark";

  const announceRecipientSuggestions = useMemo(
    () =>
      buildAnnounceRecipientSuggestions({
        channelRecipients: channelRecipients ?? [],
        cronJobs,
        effectiveChannel: channelSelectValue,
      }),
    [channelRecipients, cronJobs, channelSelectValue],
  );
  const webhookUrlSuggestions = useMemo(
    () => buildWebhookUrlSuggestions(cronJobs),
    [cronJobs],
  );

  const draftForValidation: Exclude<TaskDeliverySelection, { kind: "none" }> =
    tab === "webhook" ? webhookDraft : announceDraft;
  const dialogErrors = submitAttempted
    ? validateDeliveryDialogDraft(draftForValidation, {
        isWeixinChannel,
        hasRecipientSuggestions: announceRecipientSuggestions.length > 0,
      })
    : {};

  function handleSave() {
    setSubmitAttempted(true);
    const draft: Exclude<TaskDeliverySelection, { kind: "none" }> =
      tab === "webhook"
        ? webhookDraft
        : {
            ...announceDraft,
            channel: normalizeDeliveryChannelId(
              announceDraft.channel,
              channelOptions,
            ),
          };
    const errors = validateDeliveryDialogDraft(draft, {
      isWeixinChannel,
      hasRecipientSuggestions: announceRecipientSuggestions.length > 0,
    });
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSave(draft);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="z-[60] sm:max-w-md"
        overlayClassName="z-[60]"
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit delivery target" : "Add delivery target"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "announce" | "webhook")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="announce" disabled={!hasChannel && tab !== "announce"}>
              Channel
            </TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
          </TabsList>

          <TabsContent value="announce" className="flex flex-col gap-4 pt-2">
            {!hasChannel ? (
              <p className="text-sm text-destructive">
                No messaging channel is connected. Connect a channel or use Webhook instead.
              </p>
            ) : (
              <>
                {channelRecipientsError ? (
                  <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                    <p>Could not load recipients from sessions: {channelRecipientsError}</p>
                    {onReloadRecipients ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        disabled={disabled || channelRecipientsLoading}
                        onClick={() => {
                          void onReloadRecipients({ force: true });
                        }}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Channel
                  </Label>
                  <Select
                    value={channelSelectValue}
                    onValueChange={(v) => {
                      const nextSuggestions = buildAnnounceRecipientSuggestions({
                        channelRecipients: channelRecipients ?? [],
                        cronJobs,
                        effectiveChannel: v,
                      });
                      const keepTo =
                        Boolean(announceDraft.to?.trim()) &&
                        nextSuggestions.some((s) => s.value === announceDraft.to);
                      setAnnounceDraft((d) => ({
                        ...d,
                        channel: v,
                        to: keepTo ? d.to : "",
                      }));
                    }}
                    disabled={disabled || channelOptions.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className="z-[200] min-w-[var(--radix-select-trigger-width)]"
                    >
                      {channelOptions.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id} textValue={ch.label}>
                          <ChannelOptionLabel
                            channelId={ch.id}
                            label={ch.label}
                            systemImage={ch.systemImage}
                            size="sm"
                          />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recipient / group ID{" "}
                    {isWeixinChannel ? <span className="text-destructive">*</span> : null}
                  </Label>
                  <Input
                    autoComplete="off"
                    list={
                      announceRecipientSuggestions.length > 0
                        ? recipientListId
                        : undefined
                    }
                    placeholder={
                      channelRecipientsLoading
                        ? "Loading suggestions…"
                        : isWeixinChannel
                          ? "e.g. wxid_xxxxx@im.wechat"
                          : isFeishuChannel
                            ? "e.g. user:ou_xxx"
                            : "Recipient ID (optional)"
                    }
                    value={announceDraft.to ?? ""}
                    onChange={(e) =>
                      setAnnounceDraft((d) => ({ ...d, to: e.target.value }))
                    }
                    disabled={disabled}
                    aria-invalid={Boolean(dialogErrors.deliveryTo)}
                  />
                  {announceRecipientSuggestions.length > 0 ? (
                    <datalist id={recipientListId}>
                      {announceRecipientSuggestions.map((s) => (
                        <option
                          key={`${s.source}:${s.value}`}
                          value={s.value}
                          label={s.source === "history" ? `${s.value} (from tasks)` : s.value}
                        />
                      ))}
                    </datalist>
                  ) : null}
                  {dialogErrors.deliveryTo ? (
                    <p className="text-xs text-destructive">{dialogErrors.deliveryTo}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Type an ID or pick a suggestion when the list appears. Leave empty to
                      auto-resolve from session context when possible.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Bot account ID (optional)
                  </Label>
                  <Input
                    autoComplete="off"
                    placeholder="e.g. work-bot when multiple bots share this channel"
                    value={announceDraft.accountId ?? ""}
                    onChange={(e) =>
                      setAnnounceDraft((d) => ({ ...d, accountId: e.target.value }))
                    }
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    Which bot connection to use when this channel has multiple accounts configured.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="delivery-dialog-best-effort"
                    checked={announceDraft.bestEffort}
                    onCheckedChange={(checked) =>
                      setAnnounceDraft((d) => ({
                        ...d,
                        bestEffort: checked === true,
                      }))
                    }
                    disabled={disabled}
                  />
                  <Label
                    htmlFor="delivery-dialog-best-effort"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Best-effort (do not fail the run if delivery fails)
                  </Label>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="webhook" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Webhook URL
              </Label>
              {webhookUrlSuggestions.length > 0 ? (
                <Select
                  value={webhookDraft.url || "__custom__"}
                  onValueChange={(v) =>
                    setWebhookDraft({
                      kind: "webhook",
                      url: v === "__custom__" ? "" : v,
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger aria-invalid={Boolean(dialogErrors.deliveryTo)}>
                    <SelectValue placeholder="Select or enter URL below" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[200]">
                    <SelectItem value="__custom__">Enter a new URL…</SelectItem>
                    {webhookUrlSuggestions.map((url) => (
                      <SelectItem key={url} value={url}>
                        {url}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Input
                type="url"
                autoComplete="off"
                placeholder="https://example.com/hooks/cron"
                value={webhookDraft.url}
                onChange={(e) =>
                  setWebhookDraft({ kind: "webhook", url: e.target.value })
                }
                disabled={disabled}
                aria-invalid={Boolean(dialogErrors.deliveryTo)}
              />
              {dialogErrors.deliveryTo ? (
                <p className="text-xs text-destructive">{dialogErrors.deliveryTo}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  POST the run summary when the task completes. URLs from other tasks appear
                  in the list when available.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={disabled}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={disabled || (tab === "announce" && !hasChannel)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
