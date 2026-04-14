import { create } from "zustand";
import type {
  AgentsListResult,
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsFilesGetResult,
  AgentsFilesSetResult,
  AgentFileEntry,
  ToolsCatalogResult,
  AgentSkillStatusReport,
  CronJob,
  CronStatus,
  AgentsPanel,
  AgentsCreateResult,
  AgentsDeleteResult,
  ScheduledTaskFormData,
  CronRunRecord,
} from "@/types/agents";
import type { ChannelsStatusSnapshot } from "@/types/channels";
import { useGatewayStore } from "./gateway.store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClient() {
  return useGatewayStore.getState().client;
}

function isConnected() {
  return useGatewayStore.getState().status === "connected";
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Find the first usable channel ID from the channels snapshot.
 * Returns null if no channels are configured/connected.
 */
function getDefaultChannelId(snapshot: ChannelsStatusSnapshot | null): string | null {
  if (!snapshot) { return null; }
  // channelOrder lists channels in priority order; pick first one that has at least one account
  for (const channelId of snapshot.channelOrder) {
    const accounts = snapshot.channelAccounts[channelId];
    if (Array.isArray(accounts) && accounts.length > 0) {
      return channelId;
    }
  }
  return null;
}

/** Convert a ScheduledTaskFormData to a CronSchedule suitable for the Gateway. */
function formDataToCronSchedule(
  form: ScheduledTaskFormData,
): import("@/types/agents").CronSchedule {
  // scheduleKind === "one-time": run once at a specific datetime
  if (form.scheduleKind === "one-time") {
    // TaskFormModal.buildLocalIso already produces a timezone-aware ISO string
    // (e.g. "2026-04-12T21:12:00+08:00"). Use it directly if it parses as a
    // valid date — no further offset appending needed.
    // Fallback: treat as bare datetime-local "YYYY-MM-DDTHH:mm" and append offset.
    let at: string;
    if (form.scheduleAt) {
      const d = new Date(form.scheduleAt);
      if (!isNaN(d.getTime())) {
        // Already a valid ISO string (with or without offset) — use as-is.
        at = form.scheduleAt;
      } else {
        at = new Date(Date.now() + 60_000).toISOString();
      }
    } else {
      at = new Date(Date.now() + 60_000).toISOString();
    }
    return { kind: "at", at };
  }
  // scheduleKind === "every": interval-based
  if (form.scheduleKind === "every") {
    const amount = Math.max(1, parseInt(form.everyAmount, 10) || 1);
    const unit = form.everyUnit;
    const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
    return { kind: "every", everyMs: amount * mult };
  }
  // shortcut: daily / weekly / monthly
  const [h, m] = form.preferredTime.split(":").map(Number);
  const hh = isNaN(h) ? 8 : h;
  const mm = isNaN(m) ? 0 : m;
  switch (form.scheduleKind) {
    case "daily":
      return { kind: "cron", expr: `${mm} ${hh} * * *` };
    case "weekly":
      return { kind: "cron", expr: `${mm} ${hh} * * 1` }; // Every Monday
    case "monthly":
      return { kind: "cron", expr: `${mm} ${hh} 1 * *` }; // 1st of month
    default:
      return { kind: "cron", expr: `${mm} ${hh} * * *` };
  }
}

function applyPatch(
  obj: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) {
    return obj;
  }
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return { ...obj, [head]: value };
  }
  const child = (obj[head] as Record<string, unknown>) ?? {};
  return { ...obj, [head]: applyPatch(child, rest, value) };
}

function mergeFileEntry(
  list: AgentsFilesListResult | null,
  entry: AgentFileEntry,
): AgentsFilesListResult | null {
  if (!list) {
    return list;
  }
  const hasEntry = list.files.some((f) => f.name === entry.name);
  const nextFiles = hasEntry
    ? list.files.map((f) => (f.name === entry.name ? entry : f))
    : [...list.files, entry];
  return { ...list, files: nextFiles };
}

// ── State interface ───────────────────────────────────────────────────────────

interface AgentsState {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;

  agentIdentityById: Record<string, AgentIdentityResult>;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;

  configForm: Record<string, unknown> | null;
  configBaseHash: string | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;

  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;

  toolsCatalogLoading: boolean;
  toolsCatalogError: string | null;
  toolsCatalogResult: ToolsCatalogResult | null;

  agentSkillsLoading: boolean;
  agentSkillsError: string | null;
  agentSkillsReport: AgentSkillStatusReport | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;

  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;

  cronLoading: boolean;
  cronError: string | null;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];

  // Scheduled Tasks page state
  scheduledTasksTab: "my-tasks" | "run-history";
  cronRunHistory: CronRunRecord[];
  cronRunHistoryTotal: number;
  cronRunHistoryLoading: boolean;
  cronRunHistoryError: string | null;
  cronJobSaving: boolean;
  cronJobSaveError: string | null;

  // Actions
  loadAgents: () => Promise<void>;
  selectAgent: (agentId: string) => void;
  selectPanel: (panel: AgentsPanel) => void;
  loadAgentIdentity: (agentId: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  patchConfig: (path: Array<string | number>, value: unknown) => void;
  saveConfig: () => Promise<void>;
  reloadConfig: () => Promise<void>;
  changeAgentModel: (agentId: string, modelId: string | null) => void;
  changeAgentModelFallbacks: (agentId: string, fallbacks: string[]) => void;
  changeToolsProfile: (
    agentId: string,
    profile: string | null,
    clearAllow: boolean,
  ) => void;
  changeToolsOverrides: (
    agentId: string,
    alsoAllow: string[],
    deny: string[],
  ) => void;
  loadToolsCatalog: (agentId: string) => Promise<void>;
  loadAgentFiles: (agentId: string) => Promise<void>;
  loadFileContent: (agentId: string, name: string) => Promise<void>;
  selectFile: (name: string) => void;
  changeFileDraft: (name: string, content: string) => void;
  resetFileDraft: (name: string) => void;
  saveFile: (name: string) => Promise<void>;
  loadAgentSkills: (agentId: string) => Promise<void>;
  setSkillsFilter: (filter: string) => void;
  setAgentSkills: (agentId: string, skills: string[]) => Promise<void>;
  toggleAgentSkill: (
    agentId: string,
    skillName: string,
    enabled: boolean,
  ) => Promise<void>;
  clearAgentSkills: (agentId: string) => void;
  disableAllAgentSkills: (agentId: string) => void;
  loadChannelsStatus: () => Promise<void>;
  loadCronStatus: () => Promise<void>;
  /** Load only the jobs list (faster than loadCronStatus). */
  loadCronJobs: () => Promise<void>;
  /** Create a new agent and refresh the agents list */
  createAgent: (params: {
    name: string;
    workspace: string;
    emoji?: string;
    avatar?: string;
    skills?: string[];
  }) => Promise<AgentsCreateResult | null>;
  /** Delete an agent and refresh the agents list */
  deleteAgent: (
    agentId: string,
    deleteFiles?: boolean,
  ) => Promise<AgentsDeleteResult | null>;

  // Scheduled Tasks actions
  setScheduledTasksTab: (tab: "my-tasks" | "run-history") => void;
  loadCronRunHistory: (params?: { page?: number; status?: string; timeRange?: "day" | "week" | "month" }) => Promise<void>;
  createCronJob: (form: ScheduledTaskFormData) => Promise<CronJob | null>;
  updateCronJob: (jobId: string, form: ScheduledTaskFormData) => Promise<CronJob | null>;
  deleteCronJob: (jobId: string) => Promise<void>;
  toggleCronJobEnabled: (jobId: string, enabled: boolean) => Promise<void>;
  rerunCronJob: (jobId: string) => Promise<boolean>;
}

// ── Store initial state ───────────────────────────────────────────────────────

export const useAgentsStore = create<AgentsState>()((set, get) => ({
  loading: false,
  error: null,
  agentsList: null,
  selectedAgentId: null,
  activePanel: "overview",
  agentIdentityById: {},
  agentIdentityLoading: false,
  agentIdentityError: null,
  configForm: null,
  configBaseHash: null,
  configLoading: false,
  configSaving: false,
  configDirty: false,
  agentFilesLoading: false,
  agentFilesError: null,
  agentFilesList: null,
  agentFileActive: null,
  agentFileContents: {},
  agentFileDrafts: {},
  agentFileSaving: false,
  toolsCatalogLoading: false,
  toolsCatalogError: null,
  toolsCatalogResult: null,
  agentSkillsLoading: false,
  agentSkillsError: null,
  agentSkillsReport: null,
  agentSkillsAgentId: null,
  skillsFilter: "",
  channelsLoading: false,
  channelsError: null,
  channelsSnapshot: null,
  channelsLastSuccess: null,
  cronLoading: false,
  cronError: null,
  cronStatus: null,
  cronJobs: [],
  scheduledTasksTab: "my-tasks",
  cronRunHistory: [],
  cronRunHistoryTotal: 0,
  cronRunHistoryLoading: false,
  cronRunHistoryError: null,
  cronJobSaving: false,
  cronJobSaveError: null,
  loadAgents: async () => {
    const client = getClient();
    if (!client || !isConnected() || get().loading) { return; }
    set({ loading: true, error: null });
    try {
      const res = await client.request<AgentsListResult>("agents.list", {});
      if (res) {
        const prev = get().selectedAgentId;
        const known = prev ? res.agents.some((a) => a.id === prev) : false;
        // Only auto-select if there was a previous selection and it's still valid
        const selectedAgentId = prev && known ? prev : null;
        set({ agentsList: res, selectedAgentId });
        if (selectedAgentId) { void get().loadAgentIdentity(selectedAgentId); }
        void get().loadConfig();
      }
    } catch (err) {
      set({ error: getErrorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },

  selectAgent: (agentId) => {
    if (get().selectedAgentId === agentId) { return; }
    set({
      selectedAgentId: agentId,
      activePanel: "overview",
      agentFilesList: null,
      agentFileActive: null,
      agentFileContents: {},
      agentFileDrafts: {},
      toolsCatalogResult: null,
      agentSkillsReport: null,
      agentSkillsAgentId: null,
    });
    void get().loadAgentIdentity(agentId);
    void get().loadConfig();
  },

  selectPanel: (panel) => {
    set({ activePanel: panel });
    const agentId = get().selectedAgentId;
    if (!agentId) {
      return;
    }
    if (panel === "files" && get().agentFilesList?.agentId !== agentId) {
      void get().loadAgentFiles(agentId);
    }
    if (panel === "tools" && get().toolsCatalogResult?.agentId !== agentId) {
      void get().loadToolsCatalog(agentId);
    }
    if (panel === "skills" && get().agentSkillsAgentId !== agentId) {
      void get().loadAgentSkills(agentId);
    }
    if (panel === "channels" && !get().channelsSnapshot) {
      void get().loadChannelsStatus();
    }
    if (panel === "cron" && !get().cronStatus) {
      void get().loadCronStatus();
    }
  },

  loadAgentIdentity: async (agentId) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    set({ agentIdentityLoading: true, agentIdentityError: null });
    try {
      const res = await client.request<AgentIdentityResult>("agent.identity.get", {
        agentId,
      });
      if (res)
        {
          set((s) => ({
            agentIdentityById: { ...s.agentIdentityById, [agentId]: res },
          }));
        }
    } catch (err) {
      set({ agentIdentityError: getErrorMessage(err) });
    } finally {
      set({ agentIdentityLoading: false });
    }
  },

  loadConfig: async () => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    set({ configLoading: true });
    try {
      const res = await client.request<{ config?: Record<string, unknown>; hash?: string }>(
        "config.get",
        {},
      );
      set({ configForm: res?.config ?? null, configBaseHash: res?.hash ?? null, configDirty: false });
    } catch {
      // non-fatal
    } finally {
      set({ configLoading: false });
    }
  },

  patchConfig: (path, value) => {
    const current = get().configForm ?? {};
    set({ configForm: applyPatch(current, path, value), configDirty: true });
  },

  saveConfig: async () => {
    const client = getClient();
    if (!client) {
      return;
    }
    const configForm = get().configForm;
    if (!configForm) {
      return;
    }
    set({ configSaving: true });
    try {
      // config.set requires raw (JSON string) + optional baseHash for conflict detection
      const raw = JSON.stringify(configForm, null, 2);
      const configBaseHash = get().configBaseHash;
      const params: Record<string, unknown> = { raw };
      if (configBaseHash) { params.baseHash = configBaseHash; }
      await client.request("config.set", params);
      set({ configDirty: false });
      // Reload to get updated hash for subsequent saves
      await get().loadConfig();
      await get().loadAgents();
    } catch (err) {
      set({ error: getErrorMessage(err) });
    } finally {
      set({ configSaving: false });
    }
  },

  reloadConfig: async () => {
    await get().loadConfig();
  },
  changeAgentModel: (agentId, modelId) => {
    const form = get().configForm;
    if (!form) {
      return;
    }
    const agents = (form.agents as Record<string, unknown>) ?? {};
    const list = [...((agents.list as Record<string, unknown>[]) ?? [])];
    const idx = list.findIndex((a) => a.id === agentId);
    if (idx === -1) {
      return;
    }
    const entry = { ...list[idx] };
    if (modelId) {
      const ex = entry.model;
      entry.model =
        ex && typeof ex === "object"
          ? { ...(ex as Record<string, unknown>), primary: modelId }
          : modelId;
    } else {
      delete entry.model;
    }
    list[idx] = entry;
    set({
      configForm: applyPatch(form, ["agents", "list"], list),
      configDirty: true,
    });
  },

  changeAgentModelFallbacks: (agentId, fallbacks) => {
    const form = get().configForm;
    if (!form) {
      return;
    }
    const agents = (form.agents as Record<string, unknown>) ?? {};
    const list = [...((agents.list as Record<string, unknown>[]) ?? [])];
    const idx = list.findIndex((a) => a.id === agentId);
    if (idx === -1) {
      return;
    }
    const entry = { ...list[idx] };
    const ex = entry.model;
    if (ex && typeof ex === "object") {
      entry.model = { ...(ex as Record<string, unknown>), fallbacks };
    } else if (typeof ex === "string" && ex) {
      entry.model = { primary: ex, fallbacks };
    } else { entry.model = { fallbacks }; }
    list[idx] = entry;
    set({
      configForm: applyPatch(form, ["agents", "list"], list),
      configDirty: true,
    });
  },

  changeToolsProfile: (agentId, profile, clearAllow) => {
    const form = get().configForm;
    if (!form) {
      return;
    }
    const agents = (form.agents as Record<string, unknown>) ?? {};
    const list = [...((agents.list as Record<string, unknown>[]) ?? [])];
    const idx = list.findIndex((a) => a.id === agentId);
    if (idx === -1) {
      return;
    }
    const entry = { ...list[idx] };
    const tools = { ...(entry.tools as Record<string, unknown>) };
    if (profile) { tools.profile = profile; }
    else { delete tools.profile; }
    if (clearAllow) {
      delete tools.alsoAllow;
      delete tools.deny;
    }
    entry.tools = tools;
    list[idx] = entry;
    set({
      configForm: applyPatch(form, ["agents", "list"], list),
      configDirty: true,
    });
  },

  changeToolsOverrides: (agentId, alsoAllow, deny) => {
    const form = get().configForm;
    if (!form) {
      return;
    }
    const agents = (form.agents as Record<string, unknown>) ?? {};
    const list = [...((agents.list as Record<string, unknown>[]) ?? [])];
    const idx = list.findIndex((a) => a.id === agentId);
    if (idx === -1) {
      return;
    }
    const entry = { ...list[idx] };
    const tools = { ...(entry.tools as Record<string, unknown>) };
    if (alsoAllow.length > 0) { tools.alsoAllow = alsoAllow; }
    else { delete tools.alsoAllow; }
    if (deny.length > 0) { tools.deny = deny; }
    else { delete tools.deny; }
    entry.tools = tools;
    list[idx] = entry;
    set({
      configForm: applyPatch(form, ["agents", "list"], list),
      configDirty: true,
    });
  },

  loadToolsCatalog: async (agentId) => {
    const client = getClient();
    if (!client || !isConnected() || get().toolsCatalogLoading) {
      return;
    }
    set({ toolsCatalogLoading: true, toolsCatalogError: null });
    try {
      const res = await client.request<ToolsCatalogResult>("tools.catalog", {
        agentId,
        includePlugins: true,
      });
      if (res) { set({ toolsCatalogResult: res }); }
    } catch (err) {
      set({ toolsCatalogError: getErrorMessage(err) });
    } finally {
      set({ toolsCatalogLoading: false });
    }
  },
  loadAgentFiles: async (agentId) => {
    const client = getClient();
    if (!client || !isConnected() || get().agentFilesLoading) {
      return;
    }
    set({ agentFilesLoading: true, agentFilesError: null });
    try {
      const res = await client.request<AgentsFilesListResult>(
        "agents.files.list",
        { agentId },
      );
      if (res) { set({ agentFilesList: res }); }
    } catch (err) {
      set({ agentFilesError: getErrorMessage(err) });
    } finally {
      set({ agentFilesLoading: false });
    }
  },

  loadFileContent: async (agentId, name) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    try {
      const res = await client.request<AgentsFilesGetResult>(
        "agents.files.get",
        { agentId, name },
      );
      if (res?.file?.content != null) {
        set((s) => ({
          agentFileContents: {
            ...s.agentFileContents,
            [name]: res.file.content!,
          },
        }));
        set((s) =>
          mergeFileEntry(s.agentFilesList, res.file)
            ? { agentFilesList: mergeFileEntry(s.agentFilesList, res.file) }
            : s,
        );
      }
    } catch {
      /* non-fatal */
    }
  },

  selectFile: (name) => set({ agentFileActive: name }),

  changeFileDraft: (name, content) =>
    set((s) => ({
      agentFileDrafts: { ...s.agentFileDrafts, [name]: content },
    })),

  resetFileDraft: (name) =>
    set((s) => {
      const drafts = { ...s.agentFileDrafts };
      delete drafts[name];
      return { agentFileDrafts: drafts };
    }),

  saveFile: async (name) => {
    const client = getClient();
    if (!client) {
      return;
    }
    const agentId = get().selectedAgentId;
    if (!agentId) {
      return;
    }
    const content =
      get().agentFileDrafts[name] ?? get().agentFileContents[name] ?? "";
    set({ agentFileSaving: true });
    try {
      const res = await client.request<AgentsFilesSetResult>(
        "agents.files.set",
        { agentId, name, content },
      );
      if (res?.file) {
        set((s) => ({
          agentFileContents: { ...s.agentFileContents, [name]: content },
          agentFileDrafts: (() => {
            const d = { ...s.agentFileDrafts };
            delete d[name];
            return d;
          })(),
          agentFilesList: mergeFileEntry(s.agentFilesList, res.file),
        }));
      }
    } catch (err) {
      set({ agentFilesError: getErrorMessage(err) });
    } finally {
      set({ agentFileSaving: false });
    }
  },

  loadAgentSkills: async (agentId) => {
    const client = getClient();
    if (!client || !isConnected() || get().agentSkillsLoading) {
      return;
    }
    set({
      agentSkillsLoading: true,
      agentSkillsError: null,
      agentSkillsAgentId: agentId,
    });
    try {
      const res = await client.request<AgentSkillStatusReport>(
        "skills.status",
        { agentId },
      );
      if (res) { set({ agentSkillsReport: res }); }
    } catch (err) {
      set({ agentSkillsError: getErrorMessage(err) });
    } finally {
      set({ agentSkillsLoading: false });
    }
  },

  setSkillsFilter: (filter) => set({ skillsFilter: filter }),

  setAgentSkills: async (agentId, skills) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }

    const nextSkills = Array.from(new Set(skills.map((s) => s.trim()).filter(Boolean)));

    try {
      await client.request("agents.update", {
        agentId,
        skills: nextSkills,
      });

      set((state) => {
        if (!state.agentsList) {
          return state;
        }
        return {
          agentsList: {
            ...state.agentsList,
            agents: state.agentsList.agents.map((agent) =>
              agent.id === agentId ? { ...agent, skills: nextSkills } : agent,
            ),
          },
        };
      });

      if (get().agentSkillsAgentId === agentId) {
        await get().loadAgentSkills(agentId);
      }
    } catch (err) {
      set({ agentSkillsError: getErrorMessage(err) });
    }
  },

  toggleAgentSkill: async (agentId, skillName, enabled) => {
    const client = getClient();
    if (!client) {
      return;
    }
    // skillKey is the unique key used by skills.update; name maps to skillKey here
    // enabled=true means currently disabled → we want to enable it (pass enabled: true)
    // enabled=false means currently enabled → we want to disable it (pass enabled: false)
    try {
      await client.request("skills.update", {
        skillKey: skillName,
        enabled: !enabled,
      });
      await get().loadAgentSkills(agentId);
    } catch (err) {
      set({ agentSkillsError: getErrorMessage(err) });
    }
  },

  clearAgentSkills: (agentId) => {
    if (get().agentSkillsAgentId === agentId) {
      set({ agentSkillsReport: null, agentSkillsAgentId: null });
    }
  },

  disableAllAgentSkills: (_agentId?: string) => {
    const report = get().agentSkillsReport;
    if (!report) {
      return;
    }
    const skills = report.skills.map((s) => ({ ...s, disabled: true }));
    set({ agentSkillsReport: { ...report, skills } });
  },

  loadChannelsStatus: async () => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    set({ channelsLoading: true, channelsError: null });
    try {
      const res = await client.request<ChannelsStatusSnapshot>(
        "channels.status",
        {},
      );
      if (res) { set({ channelsSnapshot: res, channelsLastSuccess: Date.now() }); }
    } catch (err) {
      set({ channelsError: getErrorMessage(err) });
    } finally {
      set({ channelsLoading: false });
    }
  },

  loadCronStatus: async () => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    set({ cronLoading: true, cronError: null });
    try {
      const statusRes = await client.request<CronStatus>("cron.status", {});
      const jobsRes = await client.request<{ jobs?: CronJob[] }>(
        "cron.list",
        { includeDisabled: true },
      );
      set({
        cronStatus: statusRes ?? null,
        cronJobs: jobsRes?.jobs ?? [],
      });
    } catch (err) {
      set({ cronError: getErrorMessage(err) });
    } finally {
      set({ cronLoading: false });
    }
  },

  loadCronJobs: async () => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    set({ cronLoading: true, cronError: null });
    try {
      const res = await client.request<{ jobs?: CronJob[] }>(
        "cron.list",
        { includeDisabled: true },
      );
      set({ cronJobs: res?.jobs ?? [] });
    } catch (err) {
      set({ cronError: getErrorMessage(err) });
    } finally {
      set({ cronLoading: false });
    }
  },

  createAgent: async (params) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return null;
    }
    try {
      const res = await client.request<AgentsCreateResult>(
        "agents.create",
        params,
      );
      if (res) {
        // Refresh list and select the new agent
        await get().loadAgents();
        get().selectAgent(res.agentId);
      }
      return res ?? null;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  deleteAgent: async (agentId, deleteFiles = true) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return null;
    }
    try {
      const res = await client.request<AgentsDeleteResult>("agents.delete", {
        agentId,
        deleteFiles,
      });
      if (res?.ok) {
        // Refresh list; if the deleted agent was selected, loadAgents will pick next
        const prev = get().selectedAgentId;
        if (prev === agentId) {
          set({ selectedAgentId: null });
        }
        await get().loadAgents();
      }
      return res ?? null;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  // ── Scheduled Tasks actions ──────────────────────────────────────────────

  setScheduledTasksTab: (tab) => set({ scheduledTasksTab: tab }),

  loadCronRunHistory: async (params) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    set({ cronRunHistoryLoading: true, cronRunHistoryError: null });
    try {
      // Fetch all entries from Gateway without server-side filtering;
      // client-side filtering is applied in the UI (ScheduledTasksPage).
      const res = await client.request<{
        entries?: Array<{
          ts: number;
          jobId: string;
          jobName?: string;
          status?: "ok" | "error" | "skipped";
          durationMs?: number;
          error?: string;
          sessionId?: string;
          sessionKey?: string;
        }>;
        total?: number;
      }>("cron.runs", {
        scope: "all",
        limit: 200,
        offset: ((params?.page ?? 1) - 1) * 200,
        sortDir: "desc",
      });

      const entries = res?.entries ?? [];
      const records: CronRunRecord[] = entries.map((e) => ({
        id: `${e.jobId}-${e.ts}`,
        jobId: e.jobId,
        // jobName may be absent when the job was deleted (e.g. deleteAfterRun tasks);
        // fall back to a short UUID suffix so the table is still readable.
        jobName: e.jobName && e.jobName.trim() ? e.jobName : `…${e.jobId.slice(-8)}`,
        // Map Gateway status: ok→success, error/skipped/unknown→failed
        status: e.status === "ok" ? "success" : e.status === "error" || e.status === "skipped" ? "failed" : "failed",
        executionTime: e.ts,
        durationMs: e.durationMs,
        error: e.error,
        sessionId: e.sessionId,
        sessionKey: e.sessionKey,
      }));

      set({
        cronRunHistory: records,
        cronRunHistoryTotal: res?.total ?? records.length,
      });
    } catch (err) {
      set({ cronRunHistoryError: getErrorMessage(err) });
    } finally {
      set({ cronRunHistoryLoading: false });
    }
  },

  createCronJob: async (form) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return null;
    }
    set({ cronJobSaving: true, cronJobSaveError: null });
    try {
      // Convert ScheduledTaskFormData to CronSchedule
      const schedule = formDataToCronSchedule(form);
      const payload = { kind: "agentTurn" as const, message: form.agentPrompt };
      // Resolve delivery: if announce, auto-pick default channel; fallback to none if missing.
      let delivery: { mode: "announce" | "none"; channel?: string };
      if (form.deliveryMode === "announce") {
        const channelId = getDefaultChannelId(get().channelsSnapshot);
        if (channelId) {
          delivery = { mode: "announce" as const, channel: channelId };
        } else {
          // No channel available — silently downgrade to none to avoid runtime error
          delivery = { mode: "none" as const };
        }
      } else {
        delivery = { mode: "none" as const };
      }
      const res = await client.request<CronJob>("cron.add", {
        name: form.name,
        description: form.agentPrompt.slice(0, 120),
        enabled: true,
        // Explicitly set deleteAfterRun=false for one-time tasks;
        // Gateway defaults to true for kind="at" which would remove the job after run.
        deleteAfterRun: false,
        schedule,
        payload,
        delivery,
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
      });
      // Optimistically prepend the new job so the UI reflects it immediately,
      // then reload from server to sync authoritative state.
      if (res) {
        set((state) => ({ cronJobs: [res, ...state.cronJobs] }));
      }
      await get().loadCronJobs();
      return res ?? null;
    } catch (err) {
      set({ cronJobSaveError: getErrorMessage(err) });
      return null;
    } finally {
      set({ cronJobSaving: false });
    }
  },

  updateCronJob: async (jobId, form) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return null;
    }
    set({ cronJobSaving: true, cronJobSaveError: null });
    try {
      const schedule = formDataToCronSchedule(form);
      const payload = { kind: "agentTurn" as const, message: form.agentPrompt };
      // Resolve delivery: if announce, auto-pick default channel; fallback to none if missing.
      let delivery: { mode: "announce" | "none"; channel?: string };
      if (form.deliveryMode === "announce") {
        const channelId = getDefaultChannelId(get().channelsSnapshot);
        if (channelId) {
          delivery = { mode: "announce" as const, channel: channelId };
        } else {
          delivery = { mode: "none" as const };
        }
      } else {
        delivery = { mode: "none" as const };
      }
      const res = await client.request<CronJob>("cron.update", {
        id: jobId,
        patch: {
          name: form.name,
          description: form.agentPrompt.slice(0, 120),
          schedule,
          payload,
          delivery,
        },
      });
      await get().loadCronJobs();
      return res ?? null;
    } catch (err) {
      set({ cronJobSaveError: getErrorMessage(err) });
      return null;
    } finally {
      set({ cronJobSaving: false });
    }
  },

  deleteCronJob: async (jobId) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    try {
      await client.request("cron.remove", { id: jobId });
      await get().loadCronJobs();
    } catch (err) {
      set({ cronError: getErrorMessage(err) });
    }
  },

  toggleCronJobEnabled: async (jobId, enabled) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    // Optimistic UI update
    set((state) => ({
      cronJobs: state.cronJobs.map((j) =>
        j.id === jobId ? { ...j, enabled } : j,
      ),
    }));
    try {
      await client.request("cron.update", { id: jobId, patch: { enabled } });
    } catch (err) {
      // Revert on failure
      set((state) => ({
        cronJobs: state.cronJobs.map((j) =>
          j.id === jobId ? { ...j, enabled: !enabled } : j,
        ),
        cronError: getErrorMessage(err),
      }));
    }
  },

  rerunCronJob: async (jobId) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return false;
    }
    try {
      await client.request("cron.run", { id: jobId, mode: "force" });
      return true;
    } catch (err) {
      set({ cronError: getErrorMessage(err) });
      return false;
    }
  },
}));
