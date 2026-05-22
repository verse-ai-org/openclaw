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
  ChannelRecipientEntry,
} from "@/types/agents";
import type { ChannelsStatusSnapshot } from "@/types/channels";
import {
  buildCronJobCreateBody,
  buildCronJobUpdatePatch,
} from "@/lib/cron-job-form";
import { mapGatewayCronRunEntry, type GatewayCronRunEntry } from "@/lib/cron-run-detail";
import { useGatewayStore } from "./gateway.store";
import { useChannelsStore } from "./channels.store";

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

/** Prefer Channels page snapshot; fall back to agents slice for legacy callers. */
function resolveChannelsSnapshot(
  agentsSnapshot: ChannelsStatusSnapshot | null,
): ChannelsStatusSnapshot | null {
  return useChannelsStore.getState().snapshot ?? agentsSnapshot;
}

function isConfigBaseHashConflict(err: unknown): boolean {
  return getErrorMessage(err).includes("config changed since last load");
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
  configError: string | null;

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
  channelRecipients: ChannelRecipientEntry[];
  channelRecipientsLoading: boolean;
  channelRecipientsError: string | null;

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
  applyProviderConfig: (params: {
    providerId: string;
    authMode: "api-key" | "oauth" | "token";
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
  }) => Promise<void>;
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
  /** Load all session recipients once; filter by channel in UI. */
  loadChannelRecipients: (options?: { force?: boolean }) => Promise<boolean>;
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
  loadCronRunHistory: (params?: {
    page?: number;
    timeFilter?: "day" | "week" | "month";
    statusFilter?: "all" | "success" | "failed";
  }) => Promise<void>;
  createCronJob: (form: ScheduledTaskFormData) => Promise<CronJob | null>;
  updateCronJob: (jobId: string, form: ScheduledTaskFormData) => Promise<CronJob | null>;
  deleteCronJob: (jobId: string) => Promise<void>;
  toggleCronJobEnabled: (jobId: string, enabled: boolean) => Promise<void>;
  rerunCronJob: (jobId: string) => Promise<boolean>;
}

// ── Store initial state ───────────────────────────────────────────────────────

let channelRecipientsInflight: Promise<boolean> | null = null;

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
  configError: null,
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
  channelRecipients: [],
  channelRecipientsLoading: false,
  channelRecipientsError: null,
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
    set({ configLoading: true, configError: null });
    try {
      const res = await client.request<{ config?: Record<string, unknown>; hash?: string }>(
        "config.get",
        {},
      );
      set({
        configForm: res?.config ?? null,
        configBaseHash: res?.hash ?? null,
        configDirty: false,
        configError: null,
      });
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

  applyProviderConfig: async ({ providerId, authMode, modelId, apiKey, baseUrl }) => {
    const client = getClient();
    if (!client) {
      return;
    }
    set({ configSaving: true, configError: null });
    try {
      let configBaseHash = get().configBaseHash;
      if (!configBaseHash) {
        const latest = await client.request<{ hash?: string }>("config.get", {});
        configBaseHash = latest?.hash ?? null;
        if (configBaseHash) {
          set({ configBaseHash });
        }
      }

      const runApply = async (baseHash: string | null) =>
        client.request("config.provider.apply", {
          providerId,
          authMode,
          modelId,
          apiKey,
          baseUrl,
          ...(baseHash ? { baseHash } : {}),
        });

      try {
        await runApply(configBaseHash);
      } catch (err) {
        if (!isConfigBaseHashConflict(err)) {
          throw err;
        }
        const latest = await client.request<{ hash?: string }>("config.get", {});
        const refreshedHash = latest?.hash ?? null;
        set({ configBaseHash: refreshedHash });
        await runApply(refreshedHash);
      }
      await get().loadConfig();
      await get().loadAgents();
    } catch (err) {
      const message = getErrorMessage(err);
      set({ error: message, configError: message });
    } finally {
      set({ configSaving: false });
    }
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
    set({ configSaving: true, configError: null });
    try {
      // config.set requires raw (JSON string) + optional baseHash for conflict detection
      const raw = JSON.stringify(configForm, null, 2);
      let configBaseHash = get().configBaseHash;
      if (!configBaseHash) {
        const latest = await client.request<{ hash?: string }>("config.get", {});
        configBaseHash = latest?.hash ?? null;
        if (configBaseHash) {
          set({ configBaseHash });
        }
      }
      const runSet = async (baseHash: string | null) => {
        const params: Record<string, unknown> = { raw };
        if (baseHash) {
          params.baseHash = baseHash;
        }
        await client.request("config.set", params);
      };
      try {
        await runSet(configBaseHash);
      } catch (err) {
        if (!isConfigBaseHashConflict(err)) {
          throw err;
        }
        const latest = await client.request<{ hash?: string }>("config.get", {});
        const refreshedHash = latest?.hash ?? null;
        set({ configBaseHash: refreshedHash });
        await runSet(refreshedHash);
      }
      set({ configDirty: false });
      // Reload to get updated hash for subsequent saves
      await get().loadConfig();
      await get().loadAgents();
    } catch (err) {
      const message = getErrorMessage(err);
      set({ error: message, configError: message });
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

  loadChannelRecipients: async (options?: { force?: boolean }) => {
    const force = options?.force === true;
    const state = get();
    if (
      !force &&
      state.channelRecipients.length > 0 &&
      !state.channelRecipientsError
    ) {
      return true;
    }
    if (channelRecipientsInflight) {
      return channelRecipientsInflight;
    }
    const client = getClient();
    if (!client || !isConnected()) {
      set({ channelRecipientsError: "Not connected to gateway." });
      return false;
    }
    set({ channelRecipientsLoading: true, channelRecipientsError: null });
    channelRecipientsInflight = (async () => {
      try {
        const res = await client.request<{ recipients: ChannelRecipientEntry[] }>(
          "channels.recipients",
          {},
        );
        set({
          channelRecipients: res?.recipients ?? [],
          channelRecipientsError: null,
        });
        return true;
      } catch (err) {
        set({
          channelRecipients: [],
          channelRecipientsError: getErrorMessage(err),
        });
        return false;
      } finally {
        set({ channelRecipientsLoading: false });
        channelRecipientsInflight = null;
      }
    })();
    return channelRecipientsInflight;
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
    const page = Math.max(1, params?.page ?? 1);
    const limit = 10;
    const offset = (page - 1) * limit;
    const timeFilter = params?.timeFilter ?? "week";
    const statusFilter = params?.statusFilter ?? "all";
    const now = Date.now();
    const sinceMs =
      timeFilter === "day"
        ? now - 24 * 60 * 60 * 1000
        : timeFilter === "week"
          ? now - 7 * 24 * 60 * 60 * 1000
          : now - 30 * 24 * 60 * 60 * 1000;
    const statuses =
      statusFilter === "success"
        ? (["ok"] as const)
        : statusFilter === "failed"
          ? (["error", "skipped"] as const)
          : undefined;

    set({ cronRunHistoryLoading: true, cronRunHistoryError: null });
    try {
      const res = await client.request<{
        entries?: GatewayCronRunEntry[];
        total?: number;
        hasMore?: boolean;
      }>("cron.runs", {
        scope: "all",
        limit,
        offset,
        sortDir: "desc",
        sinceMs,
        statuses,
      });

      const entries = res?.entries ?? [];
      const records: CronRunRecord[] = entries.map(mapGatewayCronRunEntry);

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
      const body = buildCronJobCreateBody(form, resolveChannelsSnapshot(get().channelsSnapshot));
      const res = await client.request<CronJob>("cron.add", body);
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
      const existingJob = get().cronJobs.find((j) => j.id === jobId);
      const patch = buildCronJobUpdatePatch(
        form,
        resolveChannelsSnapshot(get().channelsSnapshot),
        existingJob,
      );
      const res = await client.request<CronJob>("cron.update", {
        id: jobId,
        patch,
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
