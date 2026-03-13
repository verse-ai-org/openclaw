import { create } from "zustand";
import type {
  SkillImportParams,
  SkillImportResult,
  SkillRemoveResult,
  SkillStatusEntry,
  SkillStatusReport,
} from "@/types/skills";
import { useGatewayStore } from "./gateway.store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

export type SkillMessageMap = Record<string, SkillMessage>;

interface SkillsState {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  busyKey: string | null;
  filter: string;
  edits: Record<string, string>;
  messages: SkillMessageMap;

  // Actions
  loadSkills: (clearMessages?: boolean) => Promise<void>;
  setFilter: (filter: string) => void;
  setEdit: (skillKey: string, value: string) => void;
  toggleSkill: (skillKey: string, currentlyDisabled: boolean) => Promise<void>;
  saveApiKey: (skillKey: string) => Promise<void>;
  installSkill: (skillKey: string, name: string, installId: string) => Promise<void>;
  importSkill: (params: SkillImportParams) => Promise<SkillImportResult>;
  removeSkill: (baseDir: string, source: string) => Promise<SkillRemoveResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function setMessage(
  messages: SkillMessageMap,
  key: string,
  message?: SkillMessage,
): SkillMessageMap {
  const next = { ...messages };
  if (message) {
    next[key] = message;
  } else {
    delete next[key];
  }
  return next;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  loading: false,
  report: null,
  error: null,
  busyKey: null,
  filter: "",
  edits: {},
  messages: {},

  loadSkills: async (clearMessages = false) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }
    if (get().loading) {
      return;
    }

    set((s) => ({
      loading: true,
      error: null,
      messages: clearMessages ? {} : s.messages,
    }));

    try {
      const res = await client.request<SkillStatusReport | undefined>("skills.status", {});
      if (res) {
        set({ report: res });
      }
    } catch (err) {
      set({ error: getErrorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },

  setFilter: (filter) => set({ filter }),

  setEdit: (skillKey, value) => set((s) => ({ edits: { ...s.edits, [skillKey]: value } })),

  toggleSkill: async (skillKey, currentlyDisabled) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }

    set({ busyKey: skillKey, error: null });
    try {
      // currentlyDisabled=true means skill is disabled → we want to enable it
      await client.request("skills.update", { skillKey, enabled: currentlyDisabled });
      await get().loadSkills();
      set((s) => ({
        messages: setMessage(s.messages, skillKey, {
          kind: "success",
          message: currentlyDisabled ? "Skill enabled" : "Skill disabled",
        }),
      }));
    } catch (err) {
      const message = getErrorMessage(err);
      set((s) => ({
        error: message,
        messages: setMessage(s.messages, skillKey, { kind: "error", message }),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  saveApiKey: async (skillKey) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }

    const apiKey = get().edits[skillKey] ?? "";
    set({ busyKey: skillKey, error: null });
    try {
      await client.request("skills.update", { skillKey, apiKey });
      await get().loadSkills();
      set((s) => ({
        messages: setMessage(s.messages, skillKey, {
          kind: "success",
          message: "API key saved",
        }),
      }));
    } catch (err) {
      const message = getErrorMessage(err);
      set((s) => ({
        error: message,
        messages: setMessage(s.messages, skillKey, { kind: "error", message }),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  installSkill: async (skillKey, name, installId) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }

    set({ busyKey: skillKey, error: null });
    try {
      const result = await client.request<{ message?: string }>("skills.install", {
        name,
        installId,
        timeoutMs: 120000,
      });
      await get().loadSkills();
      set((s) => ({
        messages: setMessage(s.messages, skillKey, {
          kind: "success",
          message: result?.message ?? "Installed",
        }),
      }));
    } catch (err) {
      const message = getErrorMessage(err);
      set((s) => ({
        error: message,
        messages: setMessage(s.messages, skillKey, { kind: "error", message }),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  importSkill: async (params) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return { ok: false, message: "Not connected to gateway" };
    }
    try {
      const result = await client.request<SkillImportResult>("skills.import", params);
      if (result?.ok) {
        await get().loadSkills(true);
      }
      return result ?? { ok: false, message: "No response from gateway" };
    } catch (err) {
      return { ok: false, message: getErrorMessage(err) };
    }
  },

  removeSkill: async (baseDir, source) => {
    const client = getClient();
    if (!client || !isConnected()) {
      return { ok: false, message: "Not connected to gateway" };
    }
    try {
      const result = await client.request<SkillRemoveResult>("skills.remove", { baseDir, source });
      if (result?.ok) {
        await get().loadSkills(true);
      }
      return result ?? { ok: false, message: "No response from gateway" };
    } catch (err) {
      return { ok: false, message: getErrorMessage(err) };
    }
  },
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function selectFilteredSkills(state: SkillsState): SkillStatusEntry[] {
  const skills = state.report?.skills ?? [];
  const filter = state.filter.trim().toLowerCase();
  if (!filter) {
    return skills;
  }
  return skills.filter((skill) =>
    [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
  );
}
