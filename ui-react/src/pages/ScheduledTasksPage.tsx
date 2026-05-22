import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  PlusIcon,
  MessageSquareIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useChannelsStore } from "@/store/channels.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useChatStore } from "@/store/chat.store";
import { useComposerStore } from "@/store/composer.store";
import { TaskCard } from "@/components/scheduled-tasks/TaskCard";
import { NewTaskCard } from "@/components/scheduled-tasks/NewTaskCard";
import { ScheduledTasksEmptyState } from "@/components/scheduled-tasks/ScheduledTasksEmptyState";
import {
  TasksListToolbar,
  type TaskSortBy,
  type TaskStatusFilter,
} from "@/components/scheduled-tasks/TasksListToolbar";
import { getCronJobAgentPrompt } from "@/lib/cron-job-text";
import {
  RunHistoryTable,
  type RunHistoryStatusFilter,
  type RunHistoryTimeFilter,
} from "@/components/scheduled-tasks/RunHistoryTable";
import { TaskFormModal } from "@/components/scheduled-tasks/TaskFormModal";
import { buildRunningDeliveryChannelOptions } from "@/lib/delivery-channel-options";
import { cronJobToFormData } from "@/lib/cron-job-form";
import type { CronJob, ScheduledTaskFormData } from "@/types/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PageTab = "my-tasks" | "run-history";

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
  const agentsList = useAgentsStore((s) => s.agentsList);
  const loadAgents = useAgentsStore((s) => s.loadAgents);
  const channelsSnapshot = useChannelsStore((s) => s.snapshot);
  const fetchChannelsStatus = useChannelsStore((s) => s.fetchStatus);
  const defaultAgentId = agentsList?.defaultId ?? "main";
  const formAgents = agentsList?.agents ?? [];
  // Whether any messaging channel is available (used for announce-mode warning in modal)
  const channelOptions = buildRunningDeliveryChannelOptions(channelsSnapshot);
  const hasChannel = channelOptions.length > 0;

  // ── Channel recipients (for auto-complete in modal) ─────────────────────
  const channelRecipients = useAgentsStore((s) => s.channelRecipients);
  const channelRecipientsLoading = useAgentsStore((s) => s.channelRecipientsLoading);
  const channelRecipientsError = useAgentsStore((s) => s.channelRecipientsError);
  const loadChannelRecipients = useAgentsStore((s) => s.loadChannelRecipients);

  // ── Scheduled Tasks store slice ─────────────────────────────────────────
  const cronRunHistory = useAgentsStore((s) => s.cronRunHistory);
  const cronRunHistoryTotal = useAgentsStore((s) => s.cronRunHistoryTotal);
  const cronRunHistoryLoading = useAgentsStore((s) => s.cronRunHistoryLoading);
  const cronRunHistoryError = useAgentsStore((s) => s.cronRunHistoryError);
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
  const [sortBy, setSortBy] = useState<TaskSortBy>("created-desc");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  // Client-side filters for Run History
  const [historyStatusFilter, setHistoryStatusFilter] = useState<RunHistoryStatusFilter>("all");
  const [historyTimeFilter, setHistoryTimeFilter] = useState<RunHistoryTimeFilter>("week");
  const [historyPage, setHistoryPage] = useState(1);

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
      void loadCronRunHistory({
        page: historyPage,
        timeFilter: historyTimeFilter,
        statusFilter: historyStatusFilter,
      });
    }
  }, [
    isConnected,
    activeTab,
    historyPage,
    historyTimeFilter,
    historyStatusFilter,
    loadCronRunHistory,
  ]);

  function reloadRunHistory(page = historyPage) {
    void loadCronRunHistory({
      page,
      timeFilter: historyTimeFilter,
      statusFilter: historyStatusFilter,
    });
  }

  useEffect(() => {
    if (isConnected && !agentsList) {
      void loadAgents();
    }
  }, [isConnected, agentsList, loadAgents]);

  // Same channels.status source as Channels page (not stale agents.store snapshot)
  useEffect(() => {
    if (!isConnected) {
      return;
    }
    void fetchChannelsStatus(false);
  }, [isConnected, fetchChannelsStatus]);

  const channelRecipientsPrimedRef = useRef(false);
  useEffect(() => {
    if (!isConnected) {
      channelRecipientsPrimedRef.current = false;
      return;
    }
    if (channelRecipientsPrimedRef.current) {
      return;
    }
    channelRecipientsPrimedRef.current = true;
    void loadChannelRecipients().then((ok) => {
      if (!ok) {
        channelRecipientsPrimedRef.current = false;
        toast.warning("Could not load channel recipients from sessions.", {
          description: "You can still type a recipient manually or pick from past tasks.",
          duration: 5000,
        });
      }
    });
  }, [isConnected, loadChannelRecipients]);

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
    useComposerStore.getState().setPendingDraftMessage(
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
      if (activeTab === "run-history") {
        reloadRunHistory(1);
        setHistoryPage(1);
      }
    } else {
      toast.error(`Failed to start "${label}"`, { duration: 3000 });
    }
  }

  // ── Sort + filter jobs ───────────────────────────────────────────────────
  const sortedJobs: CronJob[] = cronJobs.toSorted((a: CronJob, b: CronJob) => {
    if (sortBy === "created-asc") {
      return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    }
    return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
  });

  const searchQuery = taskSearch.trim().toLowerCase();
  const filteredJobs = sortedJobs.filter((job) => {
    if (taskStatusFilter === "enabled" && !job.enabled) {
      return false;
    }
    if (taskStatusFilter === "disabled" && job.enabled) {
      return false;
    }
    if (taskStatusFilter === "failed-last" && job.state?.lastStatus !== "error") {
      return false;
    }
    if (searchQuery) {
      const prompt = getCronJobAgentPrompt(job).toLowerCase();
      const nameMatch = job.name.toLowerCase().includes(searchQuery);
      const promptMatch = prompt.includes(searchQuery);
      if (!nameMatch && !promptMatch) {
        return false;
      }
    }
    return true;
  });

  const hasActiveTaskFilters =
    taskStatusFilter !== "all" || searchQuery.length > 0;

  const initialData: Partial<ScheduledTaskFormData> | undefined = editingJob
    ? cronJobToFormData(editingJob, defaultAgentId)
    : undefined;

  // ── Render ───────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Not connected to Server.
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
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
                My Tasks
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
                  New Task
                </Button>
              </div>
            </div>
            <p className="text-base text-muted-foreground max-w-xl">
              The task will run automatically as scheduled, or it can be triggered manually at any time.
            </p>
          </div>

          {/* ── Error banner ─────────────────────────────────────────────── */}
          {(cronError ?? cronJobSaveError ?? cronRunHistoryError) && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {cronJobSaveError ?? cronError ?? cronRunHistoryError}
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PageTab)}>
            <div className="flex items-center justify-between gap-3">
              <TabsList className="inline-flex h-auto gap-1 rounded-2xl bg-muted p-1">
                <TabsTrigger
                  value="my-tasks"
                  className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  My Tasks
                </TabsTrigger>
                <TabsTrigger
                  value="run-history"
                  className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Run History
                </TabsTrigger>
              </TabsList>

            </div>

            <TabsContent value="my-tasks" className="mt-2 flex flex-col gap-4">
              {cronLoading && cronJobs.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  <span className="text-sm">Loading tasks…</span>
                </div>
              ) : cronJobs.length === 0 ? (
                <ScheduledTasksEmptyState
                  onCreate={handleOpenNew}
                  onCreateWithChat={handleCreateWithChat}
                />
              ) : (
                <>
                  <TasksListToolbar
                    searchQuery={taskSearch}
                    statusFilter={taskStatusFilter}
                    sortBy={sortBy}
                    onSearchChange={setTaskSearch}
                    onStatusFilterChange={setTaskStatusFilter}
                    onSortChange={setSortBy}
                  />
                  {filteredJobs.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                      {hasActiveTaskFilters
                        ? "No tasks match your search or filters."
                        : "No tasks to show."}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredJobs.map((job) => (
                      <TaskCard
                        key={job.id}
                        job={job}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleEnabled={toggleCronJobEnabled}
                        onRunNow={handleRerun}
                      />
                    ))}
                    {taskStatusFilter === "all" && (
                      <NewTaskCard onClick={handleOpenNew} />
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="run-history" className="mt-2">
              <RunHistoryTable
                records={cronRunHistory}
                total={cronRunHistoryTotal}
                page={historyPage}
                timeFilter={historyTimeFilter}
                statusFilter={historyStatusFilter}
                loading={cronRunHistoryLoading}
                refreshing={cronRunHistoryLoading}
                onRefresh={() => reloadRunHistory()}
                onRerun={handleRerun}
                onPageChange={setHistoryPage}
                onFilterChange={(p) => {
                  setHistoryStatusFilter(p.statusFilter);
                  setHistoryTimeFilter(p.timeFilter);
                  setHistoryPage(1);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* ── Task form modal ───────────────────────────────────────────── */}
      <TaskFormModal
        open={modalOpen}
        mode={editingJob ? "edit" : "new"}
        initialData={initialData}
        saving={cronJobSaving}
        defaultAgentId={defaultAgentId}
        agents={formAgents}
        hasChannel={hasChannel}
        channelOptions={channelOptions}
        channelRecipients={channelRecipients}
        channelRecipientsLoading={channelRecipientsLoading}
        channelRecipientsError={channelRecipientsError}
        cronJobs={cronJobs}
        onReloadChannelRecipients={loadChannelRecipients}
        onSave={(form) => void handleSave(form)}
        onClose={handleModalClose}
      />
    </>
  );
}
