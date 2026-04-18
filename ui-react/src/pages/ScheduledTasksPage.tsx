import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  PlusIcon,
  MessageSquareIcon,
  ZapIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { TaskCard } from "@/components/scheduled-tasks/TaskCard";
import { NewTaskCard } from "@/components/scheduled-tasks/NewTaskCard";
import { RunHistoryTable } from "@/components/scheduled-tasks/RunHistoryTable";
import { TaskFormModal } from "@/components/scheduled-tasks/TaskFormModal";
import type { DeliveryChannelOption } from "@/components/scheduled-tasks/TaskFormModal";
import type { CronJob, CronRunRecord, ScheduledTaskFormData } from "@/types/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PageTab = "my-tasks" | "run-history";

type SortBy = "created-desc" | "created-asc";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ScheduledTasksPage() {
  const navigate = useNavigate();

  // ── Gateway connection ──────────────────────────────────────────────────
  const isConnected = useGatewayStore((s) => s.status === "connected");

  // ── Cron state ──────────────────────────────────────────────────────────
  const cronLoading = useAgentsStore((s) => s.cronLoading);
  const cronError = useAgentsStore((s) => s.cronError);
  const cronJobs = useAgentsStore((s) => s.cronJobs);
  const loadCronStatus = useAgentsStore((s) => s.loadCronStatus);

  // ── Channels state (for delivery channel resolution) ────────────────────
  const channelsSnapshot = useAgentsStore((s) => s.channelsSnapshot);
  const loadChannelsStatus = useAgentsStore((s) => s.loadChannelsStatus);
  // Whether any messaging channel is available (used for announce-mode warning in modal)
  const hasChannel = (
    channelsSnapshot?.channelOrder.some(
      (id) => (channelsSnapshot.channelAccounts[id]?.length ?? 0) > 0,
    ) ?? false
  );
  // Build channel options list for the delivery channel selector
  const channelOptions: DeliveryChannelOption[] = channelsSnapshot
    ? channelsSnapshot.channelOrder
        .filter((id) => (channelsSnapshot.channelAccounts[id]?.length ?? 0) > 0)
        .map((id) => ({
          id,
          label:
            channelsSnapshot.channelMeta?.find((m) => m.id === id)?.label ??
            channelsSnapshot.channelLabels[id] ??
            id,
        }))
    : [];

  // ── Scheduled Tasks store slice ─────────────────────────────────────────
  const cronRunHistory = useAgentsStore((s) => s.cronRunHistory);
  const cronRunHistoryLoading = useAgentsStore((s) => s.cronRunHistoryLoading);
  const cronJobSaving = useAgentsStore((s) => s.cronJobSaving);
  const cronJobSaveError = useAgentsStore((s) => s.cronJobSaveError);
  const loadCronRunHistory = useAgentsStore((s) => s.loadCronRunHistory);
  const createCronJob = useAgentsStore((s) => s.createCronJob);
  const updateCronJob = useAgentsStore((s) => s.updateCronJob);
  const deleteCronJob = useAgentsStore((s) => s.deleteCronJob);
  const toggleCronJobEnabled = useAgentsStore((s) => s.toggleCronJobEnabled);
  const rerunCronJob = useAgentsStore((s) => s.rerunCronJob);

  // ── Local UI state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PageTab>("my-tasks");
  const [sortBy, setSortBy] = useState<SortBy>("created-desc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  // Client-side filters for Run History
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "running" | "success" | "failed">("all");
  const [historyTimeFilter, setHistoryTimeFilter] = useState<"day" | "week" | "month">("week");

  // ── Initial data load ───────────────────────────────────────────────────
  // Always refresh on mount so tasks created in Chat are visible immediately.
  useEffect(() => {
    if (isConnected) {
      void loadCronStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (isConnected && activeTab === "run-history") {
      void loadCronRunHistory();
    }
  }, [isConnected, activeTab, loadCronRunHistory]);

  // Load channels status for delivery channel resolution
  useEffect(() => {
    if (isConnected && !channelsSnapshot) {
      void loadChannelsStatus();
    }
  }, [isConnected, channelsSnapshot, loadChannelsStatus]);

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleOpenNew() {
    setEditingJob(null);
    setModalOpen(true);
  }

  function handleEdit(job: CronJob) {
    setEditingJob(job);
    setModalOpen(true);
  }

  function handleModalClose() {
    setModalOpen(false);
    setEditingJob(null);
  }

  /**
   * Open a fresh chat session on the default agent with a pre-filled draft
   * that guides the user to describe their scheduled task.
   */
  function handleCreateWithChat() {
    const agentId = useAgentsStore.getState().agentsList?.defaultId ?? "main";
    const newKey = `agent:${agentId}:${crypto.randomUUID().slice(0, 8)}`;
    useChatStore.getState().setSessionKey(newKey);
    useChatStore.getState().setPendingDraftMessage(
      "I'd like to create a scheduled task. Please help me set it up — describe what you'd like the agent to do and how often it should run.",
    );
    void navigate("/chat");
  }

  async function handleSave(form: ScheduledTaskFormData) {
    let ok: boolean;
    if (editingJob) {
      const res = await updateCronJob(editingJob.id, form);
      ok = res !== null;
    } else {
      const res = await createCronJob(form);
      ok = res !== null;
    }
    // Only close if save succeeded (no save error)
    if (ok) {
      handleModalClose();
    }
  }

  function handleDelete(jobId: string) {
    void deleteCronJob(jobId);
  }

  async function handleRerun(jobId: string, jobName?: string) {
    // If job no longer exists (deleted), show a warning instead of firing a
    // silent request that will fail on the gateway side.
    const jobExists = useAgentsStore.getState().cronJobs.some((j) => j.id === jobId);
    if (!jobExists) {
      toast.warning(`Task no longer exists and cannot be rerun.`, { duration: 3000 });
      return;
    }
    const label = jobName ?? "Task";
    const ok = await rerunCronJob(jobId);
    if (ok) {
      toast.success(`"${label}" started`, { duration: 2500 });
      // Refresh run history so the new entry appears immediately
      void loadCronRunHistory();
    } else {
      toast.error(`Failed to start "${label}"`, { duration: 3000 });
    }
  }

  function handleViewInChat(record: CronRunRecord) {
    if (record.sessionKey) {
      // Set the active session key so the chat area loads the correct history
      // and ChatSidebar's useEffect auto-syncs to the right agent + sessions view.
      useChatStore.getState().setSessionKey(record.sessionKey);
      useSettingsStore.getState().updateSettings({
        sessionKey: record.sessionKey,
        lastActiveSessionKey: record.sessionKey,
      });
    }
    void navigate("/chat");
  }

  // ── Client-side filtering for run history ──────────────────────────────
  const filteredRunHistory = cronRunHistory.filter((r) => {
    // Time filter
    if (historyTimeFilter) {
      const now = Date.now();
      let since = 0;
      if (historyTimeFilter === "day") {
        since = now - 24 * 60 * 60 * 1000;
      } else if (historyTimeFilter === "week") {
        since = now - 7 * 24 * 60 * 60 * 1000;
      } else if (historyTimeFilter === "month") {
        since = now - 30 * 24 * 60 * 60 * 1000;
      }
      if (r.executionTime < since) { return false; }
    }
    // Status filter
    if (historyStatusFilter !== "all" && r.status !== historyStatusFilter) {
      return false;
    }
    return true;
  });

  // ── Sort jobs ────────────────────────────────────────────────────────────
  const sortedJobs: CronJob[] = cronJobs.toSorted((a: CronJob, b: CronJob) => {
    if (sortBy === "created-asc") {
      return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    }
    // created-desc (default)
    return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
  });

  // ── Build form initial data from editing job ─────────────────────────────
  const initialData: Partial<ScheduledTaskFormData> | undefined = (() => {
    if (!editingJob) { return undefined; }
    const base: Partial<ScheduledTaskFormData> = {
      name: editingJob.name,
      agentPrompt:
        editingJob.payload.kind === "agentTurn" ? editingJob.payload.message : "",
    };
    const sched = editingJob.schedule;
    if (sched.kind === "every") {
      const ms = sched.everyMs;
      if (ms % 86_400_000 === 0) {
        base.scheduleKind = "every";
        base.everyAmount = String(ms / 86_400_000);
        base.everyUnit = "days";
      } else if (ms % 3_600_000 === 0) {
        base.scheduleKind = "every";
        base.everyAmount = String(ms / 3_600_000);
        base.everyUnit = "hours";
      } else {
        base.scheduleKind = "every";
        base.everyAmount = String(Math.ceil(ms / 60_000));
        base.everyUnit = "minutes";
      }
    } else if (sched.kind === "cron") {
      // Parse the cron expr to restore the original scheduleKind and preferredTime.
      // UI-created cron exprs follow the pattern: "MM HH <day> <month> <dow>"
      // daily:   "MM HH * * *"      (day=*, month=*, dow=*)
      // weekly:  "MM HH * * 1"      (day=*, month=*, dow=1)
      // monthly: "MM HH 1 * *"      (day=1, month=*, dow=*)
      const parts = sched.expr.trim().split(/\s+/);
      if (parts.length === 5) {
        const [cronMin, cronHour, cronDay, , cronDow] = parts;
        const hh = String(parseInt(cronHour, 10) || 0).padStart(2, "0");
        const mm = String(parseInt(cronMin, 10) || 0).padStart(2, "0");
        base.preferredTime = `${hh}:${mm}`;
        if (cronDow !== "*") {
          base.scheduleKind = "weekly";
        } else if (cronDay !== "*") {
          base.scheduleKind = "monthly";
        } else {
          base.scheduleKind = "daily";
        }
      } else {
        base.scheduleKind = "daily";
      }
    } else {
      // "at" schedule → one-time
      base.scheduleKind = "one-time";
      // Convert ISO string to datetime-local format "YYYY-MM-DDTHH:mm"
      const d = new Date(sched.at);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        base.scheduleAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    // Restore delivery mode from job
    base.deliveryMode = editingJob.delivery?.mode === "announce" ? "announce" : "none";
    if (editingJob.delivery?.mode === "announce") {
      const ch = editingJob.delivery.channel;
      if (typeof ch === "string" && ch.trim()) {
        base.deliveryChannel = ch.trim();
      }
      const to = editingJob.delivery.to;
      if (typeof to === "string" && to.trim()) {
        base.deliveryTo = to.trim();
      }
    }
    return base;
  })();

  // ── Render ───────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Not connected to gateway.
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-10 p-8 max-w-4xl mx-auto w-full pb-20">
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
                Scheduled Tasks
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cronLoading}
                  onClick={() => void loadCronStatus()}
                  title="Refresh"
                  className="gap-1.5"
                >
                  <RefreshCwIcon className={cn("size-3.5", cronLoading && "animate-spin")} />
                </Button>
                <Button variant="outline" size="sm" onClick={handleCreateWithChat} className="gap-1.5 rounded-full">
                  <MessageSquareIcon className="size-3.5" />
                  Create With Chat
                </Button>
                <Button size="sm" onClick={handleOpenNew} className="gap-1.5 rounded-full">
                  <PlusIcon className="size-3.5" />
                  New Scheduled Task
                </Button>
              </div>
            </div>
            <p className="text-base text-muted-foreground max-w-xl">
              The task will run automatically as scheduled, or it can be triggered manually at any time.
            </p>
          </div>

          {/* ── Error banner ─────────────────────────────────────────────── */}
          {(cronError ?? cronJobSaveError) && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {cronJobSaveError ?? cronError}
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PageTab)}>
            <div className="flex items-center justify-between gap-3">
              <TabsList className="inline-flex h-auto gap-1 rounded-2xl bg-[#F6F6F6] p-1">
                <TabsTrigger
                  value="my-tasks"
                  className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  My Scheduled Task
                </TabsTrigger>
                <TabsTrigger
                  value="run-history"
                  className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Run History
                </TabsTrigger>
              </TabsList>

              {/* Sort control */}
              {activeTab === "my-tasks" && cronJobs.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sort by</span>
                  <select
                    className="h-7 rounded-md border bg-background px-2 text-xs text-foreground"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                  >
                    <option value="created-desc">Newest First</option>
                    <option value="created-asc">Oldest First</option>
                  </select>
                </div>
              )}
            </div>

            <TabsContent value="my-tasks" className="mt-2">
              {cronLoading && cronJobs.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  <span className="text-sm">Loading tasks…</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedJobs.map((job) => (
                    <TaskCard
                      key={job.id}
                      job={job}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggleEnabled={toggleCronJobEnabled}
                      onRunNow={handleRerun}
                    />
                  ))}
                  <NewTaskCard onClick={handleOpenNew} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="run-history" className="mt-2">
              <RunHistoryTable
                records={filteredRunHistory}
                total={filteredRunHistory.length}
                loading={cronRunHistoryLoading}
                onRerun={handleRerun}
                onViewInChat={handleViewInChat}
                onFilterChange={(p) => {
                  setHistoryStatusFilter(p.statusFilter);
                  setHistoryTimeFilter(p.timeFilter);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* ── Floating action button ────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleOpenNew}
        title="New Scheduled Task"
        className="fixed bottom-6 right-6 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ZapIcon className="size-5" />
        <span className="sr-only">New Scheduled Task</span>
      </button>

      {/* ── Task form modal ───────────────────────────────────────────── */}
      <TaskFormModal
        open={modalOpen}
        mode={editingJob ? "edit" : "new"}
        initialData={initialData}
        saving={cronJobSaving}
        hasChannel={hasChannel}
        channelOptions={channelOptions}
        onSave={(form) => void handleSave(form)}
        onClose={handleModalClose}
      />
    </>
  );
}
