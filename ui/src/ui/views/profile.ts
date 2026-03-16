import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfileState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  // which tab is active
  profileTab: "template" | "edit";
  // template form
  profileTemplateId: string | null;
  profileFormName: string;
  profileFormRole: string;
  profileFormDomains: string[];
  profileFormTools: string[];
  profileFormPreferences: string[];
  profileFormCustomFields: Record<string, string>;
  // free input (still used for the "add from text" area in edit tab)
  profileFreeInput: string;
  // async state
  profileLoading: boolean;
  profileError: string | null;
  // preview modal
  profilePreviewOpen: boolean;
  profilePreviewUserMd: string;
  profilePreviewMemoryMd: string;
  profilePreviewSkippedUrls: string[];
  profileSaving: boolean;
  profileSaveSuccess: boolean;
  // draft edits inside preview modal
  profilePreviewUserMdDraft: string;
  profilePreviewMemoryMdDraft: string;
  profilePreviewMode: "preview" | "edit";
  // Profile Edit tab: current file contents
  profileEditUserMd: string;
  profileEditMemoryMd: string;
  profileEditLoading: boolean;
  profileEditInputOpen: boolean;
  profileEditViewMode: "preview" | "edit";
  // agent context
  agentsList: { defaultId?: string; agents?: Array<{ id: string }> } | null;
};

// ─── Template data ────────────────────────────────────────────────────────────

type ProfileTemplate = {
  id: string;
  emoji: string;
  title: string;
  defaultRole: string;
  defaultDomains: string[];
  defaultTools: string[];
  defaultPreferences: string[];
};

const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: "content-creator",
    emoji: "🎨",
    title: "Content Creator",
    defaultRole: "Content Creator",
    defaultDomains: ["Social Media", "Video", "Copywriting"],
    defaultTools: ["Canva", "CapCut", "Notion"],
    defaultPreferences: ["short-form content", "visual storytelling", "audience engagement"],
  },
  {
    id: "writer",
    emoji: "✍️",
    title: "Writer",
    defaultRole: "Writer",
    defaultDomains: ["Fiction", "Non-fiction", "Blogging"],
    defaultTools: ["Scrivener", "Google Docs", "Hemingway"],
    defaultPreferences: ["narrative structure", "clarity", "creative voice"],
  },
  {
    id: "travel-guide",
    emoji: "🗺️",
    title: "Travel Guide",
    defaultRole: "Travel Guide",
    defaultDomains: ["Travel Planning", "Local Culture", "Photography"],
    defaultTools: ["Google Maps", "TripAdvisor", "Instagram"],
    defaultPreferences: ["authentic experiences", "budget travel", "off-the-beaten-path"],
  },
  {
    id: "educator",
    emoji: "📚",
    title: "Educator",
    defaultRole: "Educator",
    defaultDomains: ["Teaching", "Curriculum Design", "E-learning"],
    defaultTools: ["Moodle", "Kahoot", "Loom"],
    defaultPreferences: ["clear explanations", "interactive learning", "student engagement"],
  },
  {
    id: "software-engineer",
    emoji: "💻",
    title: "Software Engineer",
    defaultRole: "Software Engineer",
    defaultDomains: ["Backend", "Frontend", "DevOps"],
    defaultTools: ["VS Code", "GitHub", "Docker"],
    defaultPreferences: ["clean code", "test coverage", "automation"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserMdSection(state: ProfileState): string {
  const tpl = PROFILE_TEMPLATES.find((t) => t.id === state.profileTemplateId);
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`## Profile (${date})`);
  if (state.profileFormName) {
    lines.push(`- **Name**: ${state.profileFormName}`);
  }
  if (state.profileFormRole) {
    lines.push(`- **Role**: ${state.profileFormRole}`);
  }
  if (tpl) {
    lines.push(`- **Template**: ${tpl.emoji} ${tpl.title}`);
  }
  if (state.profileFormDomains.length > 0) {
    lines.push(`- **Domains**: ${state.profileFormDomains.join(", ")}`);
  }
  if (state.profileFormTools.length > 0) {
    lines.push(`- **Tools**: ${state.profileFormTools.join(", ")}`);
  }
  if (state.profileFormPreferences.length > 0) {
    lines.push(`- **Preferences**: ${state.profileFormPreferences.join(", ")}`);
  }
  for (const [k, v] of Object.entries(state.profileFormCustomFields)) {
    if (k.trim() && v.trim()) {
      lines.push(`- **${k}**: ${v}`);
    }
  }
  return lines.join("\n");
}

function mergeContent(existing: string, newSection: string): string {
  const trimmed = existing.trimEnd();
  return trimmed ? `${trimmed}\n\n${newSection}` : newSection;
}

// ─── Controller actions ───────────────────────────────────────────────────────

export async function handleProfileTemplateSelect(
  state: ProfileState,
  templateId: string,
): Promise<void> {
  const tpl = PROFILE_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) {
    return;
  }
  state.profileTemplateId = templateId;
  state.profileFormRole = tpl.defaultRole;
  state.profileFormDomains = [...tpl.defaultDomains];
  state.profileFormTools = [...tpl.defaultTools];
  state.profileFormPreferences = [...tpl.defaultPreferences];
}

export async function handleProfileTemplatePreview(state: ProfileState): Promise<void> {
  if (!state.profileTemplateId) {
    state.profileError = "Please select a template first.";
    return;
  }
  const userMd = buildUserMdSection(state);
  state.profilePreviewUserMd = userMd;
  state.profilePreviewMemoryMd = "";
  state.profilePreviewSkippedUrls = [];
  state.profilePreviewOpen = true;
  state.profilePreviewUserMdDraft = userMd;
  state.profilePreviewMemoryMdDraft = "";
  state.profilePreviewMode = "preview";
  state.profileError = null;
}

export async function handleProfileFreeInputParse(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    state.profileError = "Not connected to gateway.";
    return;
  }
  const text = state.profileFreeInput.trim();
  if (!text) {
    state.profileError = "Please enter some text or URLs.";
    return;
  }
  // Extract URLs
  const urlRegex = new RegExp("https?://[^\\s,\\u3001\\uff0c\\])\"']+", "g");
  const urls = [...text.matchAll(urlRegex)].map((m) => m[0]);
  const textOnly = text.replace(urlRegex, "").replace(/\s+/g, " ").trim();

  state.profileLoading = true;
  state.profileError = null;
  try {
    const result = await state.client.request<{
      userMdContent: string;
      memoryContent: string;
      skippedUrls?: string[];
    } | null>("profile.parse", {
      text: textOnly || undefined,
      urls: urls.length > 0 ? urls : undefined,
    });
    if (!result) {
      state.profileError = "Gateway returned no result.";
      return;
    }

    if (state.profileTab === "edit") {
      // In edit tab: append directly to the in-memory content
      state.profileEditUserMd = mergeContent(state.profileEditUserMd, result.userMdContent ?? "");
      if (result.memoryContent) {
        state.profileEditMemoryMd = mergeContent(state.profileEditMemoryMd, result.memoryContent);
      }
      // Collapse input area after successful parse
      state.profileEditInputOpen = false;
      state.profileFreeInput = "";
    } else {
      // In template tab: use preview modal flow
      state.profilePreviewUserMd = result.userMdContent ?? "";
      state.profilePreviewMemoryMd = result.memoryContent ?? "";
      state.profilePreviewSkippedUrls = result.skippedUrls ?? [];
      state.profilePreviewOpen = true;
      state.profilePreviewUserMdDraft = result.userMdContent ?? "";
      state.profilePreviewMemoryMdDraft = result.memoryContent ?? "";
      state.profilePreviewMode = "preview";
    }

    if (result.skippedUrls && result.skippedUrls.length > 0) {
      state.profileError = `⚠️ Could not fetch: ${result.skippedUrls.join(", ")}`;
    }
  } catch (err) {
    state.profileError = String(err);
  } finally {
    state.profileLoading = false;
  }
}

export async function handleProfileSave(
  state: ProfileState,
  userMd: string,
  memoryMd: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    state.profileError = "Not connected to gateway.";
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";

  state.profileSaving = true;
  state.profileError = null;
  try {
    // Save USER.md
    if (userMd.trim()) {
      const getRes = await state.client.request<{
        file?: { content?: string };
      } | null>("agents.files.get", { agentId, name: "USER.md" });
      const existing = getRes?.file?.content ?? "";
      const merged = mergeContent(existing, userMd.trim());
      await state.client.request("agents.files.set", {
        agentId,
        name: "USER.md",
        content: merged,
      });
    }
    // Save MEMORY.md if provided
    if (memoryMd.trim()) {
      const getRes = await state.client.request<{
        file?: { content?: string };
      } | null>("agents.files.get", { agentId, name: "MEMORY.md" });
      const existing = getRes?.file?.content ?? "";
      const merged = mergeContent(existing, memoryMd.trim());
      await state.client.request("agents.files.set", {
        agentId,
        name: "MEMORY.md",
        content: merged,
      });
    }
    state.profilePreviewOpen = false;
    state.profileSaveSuccess = true;
    // Reset success flag after 3 seconds
    setTimeout(() => {
      state.profileSaveSuccess = false;
    }, 3000);
  } catch (err) {
    state.profileError = String(err);
  } finally {
    state.profileSaving = false;
  }
}

// Load current USER.md / MEMORY.md into edit tab
export async function handleProfileEditLoad(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";
  state.profileEditLoading = true;
  state.profileError = null;
  try {
    const [userRes, memRes] = await Promise.all([
      state.client.request<{ file?: { content?: string } } | null>("agents.files.get", {
        agentId,
        name: "USER.md",
      }),
      state.client.request<{ file?: { content?: string } } | null>("agents.files.get", {
        agentId,
        name: "MEMORY.md",
      }),
    ]);
    state.profileEditUserMd = userRes?.file?.content ?? "";
    state.profileEditMemoryMd = memRes?.file?.content ?? "";
  } catch (err) {
    state.profileError = String(err);
  } finally {
    state.profileEditLoading = false;
  }
}

// Directly save edited USER.md and MEMORY.md content
export async function handleProfileEditSaveDirect(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    state.profileError = "Not connected to gateway.";
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";
  state.profileSaving = true;
  state.profileError = null;
  try {
    await Promise.all([
      state.client.request("agents.files.set", {
        agentId,
        name: "USER.md",
        content: state.profileEditUserMd,
      }),
      state.client.request("agents.files.set", {
        agentId,
        name: "MEMORY.md",
        content: state.profileEditMemoryMd,
      }),
    ]);
    state.profileSaveSuccess = true;
    setTimeout(() => {
      state.profileSaveSuccess = false;
    }, 3000);
  } catch (err) {
    state.profileError = String(err);
  } finally {
    state.profileSaving = false;
  }
}

// ─── Render helpers ───────────────────────────────────────────────────────────

// Renders one editable file section with Preview / Edit toggle
function renderEditSection(
  label: string,
  content: string,
  viewMode: "preview" | "edit",
  onViewModeChange: (mode: "preview" | "edit") => void,
  onContentChange: (value: string) => void,
) {
  const isEmpty = !content.trim();
  return html`
    <div style="margin-bottom: 20px;">
      <div
        style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;"
      >
        <span style="font-weight:600; font-size:13px;">${label}</span>
        ${
          isEmpty
            ? nothing
            : html`
              <div style="display:flex; gap:4px;">
                <button
                  class="btn btn-xs ${viewMode === "preview" ? "active" : ""}"
                  style="padding:2px 8px; font-size:12px;"
                  @click=${() => onViewModeChange("preview")}
                >
                  Preview
                </button>
                <button
                  class="btn btn-xs ${viewMode === "edit" ? "active" : ""}"
                  style="padding:2px 8px; font-size:12px;"
                  @click=${() => onViewModeChange("edit")}
                >
                  Edit
                </button>
              </div>
            `
        }
      </div>
      ${
        isEmpty
          ? html`
              <div
                class="muted"
                style="
                  padding: 20px 14px;
                  background: var(--surface-2, #f9f9f9);
                  border: 1px dashed var(--border, #e0e0e0);
                  border-radius: 6px;
                  font-size: 13px;
                  text-align: center;
                "
              >
                No content yet — use &ldquo;Add from Text / URL&rdquo; below.
              </div>
            `
          : viewMode === "preview"
            ? html`<div
              class="markdown-preview"
              style="
                padding: 12px 14px;
                background: var(--surface-2, #f9f9f9);
                border: 1px solid var(--border, #e0e0e0);
                border-radius: 6px;
                font-size: 13px;
                line-height: 1.6;
                overflow: auto;
                max-height: 320px;
              "
            >
              ${unsafeHTML(toSanitizedMarkdownHtml(content))}
            </div>`
            : html`<textarea
              rows="10"
              style="
                font-family: monospace;
                font-size: 13px;
                width: 100%;
                box-sizing: border-box;
                max-height: 320px;
              "
              .value=${content}
              @input=${(e: Event) => onContentChange((e.target as HTMLTextAreaElement).value)}
            ></textarea>`
      }
    </div>
  `;
}

function renderTagInput(values: string[], onChange: (next: string[]) => void, placeholder: string) {
  const addValue = (raw: string) => {
    const val = raw.trim();
    if (val && !values.includes(val)) {
      onChange([...values, val]);
    }
  };
  const removeValue = (val: string) => {
    onChange(values.filter((v) => v !== val));
  };

  return html`
    <div class="tag-input-wrap">
      <div class="tag-list">
        ${values.map(
          (v) => html`
            <span class="chip">
              ${v}
              <button
                class="chip-remove"
                aria-label="Remove ${v}"
                @click=${() => removeValue(v)}
              >
                ×
              </button>
            </span>
          `,
        )}
      </div>
      <input
        class="tag-input"
        placeholder="${placeholder}"
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const target = e.target as HTMLInputElement;
            addValue(target.value);
            target.value = "";
          }
        }}
        @blur=${(e: FocusEvent) => {
          const target = e.target as HTMLInputElement;
          if (target.value.trim()) {
            addValue(target.value);
            target.value = "";
          }
        }}
      />
      <div class="tag-hint muted">Press Enter or comma to add</div>
    </div>
  `;
}

function renderTemplateSelect(state: ProfileState, onSelect: (id: string) => void) {
  return html`
    <div class="profile-templates-grid">
      ${PROFILE_TEMPLATES.map(
        (tpl) => html`
          <button
            class="profile-template-card ${state.profileTemplateId === tpl.id ? "selected" : ""}"
            @click=${() => onSelect(tpl.id)}
          >
            <div class="template-emoji">${tpl.emoji}</div>
            <div class="template-title">${tpl.title}</div>
          </button>
        `,
      )}
    </div>
  `;
}

function renderTemplateForm(
  state: ProfileState,
  onChange: (field: string, value: unknown) => void,
) {
  const tpl = PROFILE_TEMPLATES.find((t) => t.id === state.profileTemplateId);
  return html`
    <div class="profile-form">
      <label class="field">
        <span>Name</span>
        <input
          .value=${state.profileFormName}
          placeholder="Your name"
          @input=${(e: Event) => onChange("profileFormName", (e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span>Role</span>
        <input
          .value=${state.profileFormRole}
          placeholder="${tpl?.defaultRole ?? "Your role"}"
          @input=${(e: Event) => onChange("profileFormRole", (e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="field">
        <span>Domains</span>
        ${renderTagInput(
          state.profileFormDomains,
          (next) => onChange("profileFormDomains", next),
          "Add domain…",
        )}
      </div>
      <div class="field">
        <span>Tools</span>
        ${renderTagInput(
          state.profileFormTools,
          (next) => onChange("profileFormTools", next),
          "Add tool…",
        )}
      </div>
      <div class="field">
        <span>Preferences</span>
        ${renderTagInput(
          state.profileFormPreferences,
          (next) => onChange("profileFormPreferences", next),
          "Add preference…",
        )}
      </div>
    </div>
  `;
}

function renderPreviewModal(
  state: ProfileState,
  onClose: () => void,
  onSave: (userMd: string, memoryMd: string) => void,
  onModeChange: (mode: "preview" | "edit") => void,
  onDraftChange: (field: "user" | "memory", value: string) => void,
) {
  if (!state.profilePreviewOpen) {
    return nothing;
  }

  const isPreview = state.profilePreviewMode === "preview";

  const renderSection = (
    label: string,
    draft: string,
    field: "user" | "memory",
    rows: number,
  ) => html`
    <div class="field" style="margin-bottom: 16px;">
      <div
        style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;"
      >
        <span>${label}</span>
        <div class="preview-mode-tabs" style="display:flex; gap:4px;">
          <button
            class="btn btn-xs ${isPreview ? "active" : ""}"
            style="padding:2px 8px; font-size:12px;"
            @click=${() => onModeChange("preview")}
          >
            Preview
          </button>
          <button
            class="btn btn-xs ${!isPreview ? "active" : ""}"
            style="padding:2px 8px; font-size:12px;"
            @click=${() => onModeChange("edit")}
          >
            Edit
          </button>
        </div>
      </div>
      ${
        isPreview
          ? html`<div
            class="markdown-preview"
            style="
              min-height: ${rows * 24}px;
              padding: 12px 14px;
              background: var(--surface-2, #f9f9f9);
              border: 1px solid var(--border, #e0e0e0);
              border-radius: 6px;
              font-size: 13px;
              line-height: 1.6;
              overflow: auto;
            "
          >
            ${unsafeHTML(toSanitizedMarkdownHtml(draft))}
          </div>`
          : html`<textarea
            rows=${rows}
            style="font-family: monospace; font-size: 13px; width:100%; box-sizing:border-box;"
            .value=${draft}
            @input=${(e: Event) => onDraftChange(field, (e.target as HTMLTextAreaElement).value)}
          ></textarea>`
      }
    </div>
  `;

  return html`
    <div class="modal-overlay" @click=${onClose}>
      <div class="modal-box" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <div class="modal-title">Preview & Confirm</div>
          <button class="btn" @click=${onClose}>✕</button>
        </div>

        ${
          state.profilePreviewSkippedUrls.length > 0
            ? html`
              <div class="callout warn" style="margin-bottom: 12px;">
                ⚠️ Could not fetch:
                ${state.profilePreviewSkippedUrls.join(", ")}
              </div>
            `
            : nothing
        }
        ${renderSection(
          "USER.md content (will be appended)",
          state.profilePreviewUserMdDraft,
          "user",
          8,
        )}
        ${
          state.profilePreviewMemoryMdDraft
            ? renderSection(
                "MEMORY.md content (will be appended)",
                state.profilePreviewMemoryMdDraft,
                "memory",
                6,
              )
            : nothing
        }

        <div class="modal-footer">
          <button
            class="btn"
            @click=${onClose}
            ?disabled=${state.profileSaving}
          >
            Cancel
          </button>
          <button
            class="btn primary"
            ?disabled=${state.profileSaving}
            @click=${() =>
              onSave(state.profilePreviewUserMdDraft, state.profilePreviewMemoryMdDraft)}
          >
            ${state.profileSaving ? "Saving…" : "Save to workspace"}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Main render ──────────────────────────────────────────────────────────────

export type ProfileProps = {
  state: ProfileState;
  onTabChange: (tab: "template" | "edit") => void;
  onTemplateSelect: (id: string) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onTemplatePreview: () => void;
  onFreeInputChange: (text: string) => void;
  onFreeInputParse: () => void;
  onPreviewClose: () => void;
  onPreviewModeChange: (mode: "preview" | "edit") => void;
  onPreviewDraftChange: (field: "user" | "memory", value: string) => void;
  onSave: (userMd: string, memoryMd: string) => void;
  // Edit tab handlers
  onEditLoad: () => void;
  onEditViewModeChange: (mode: "preview" | "edit") => void;
  onEditUserMdChange: (value: string) => void;
  onEditMemoryMdChange: (value: string) => void;
  onEditSaveDirect: () => void;
  onEditInputToggle: (open: boolean) => void;
};

export function renderProfile(props: ProfileProps) {
  const { state } = props;

  return html`
    <section class="card">
      <div class="card-title">Profile</div>
      <div class="card-sub">Update your personal profile and memory files.</div>

      ${
        state.profileSaveSuccess
          ? html`
              <div class="callout ok" style="margin-top: 12px">✓ Profile saved successfully.</div>
            `
          : nothing
      }
      ${
        state.profileError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${state.profileError}
          </div>`
          : nothing
      }

      <!-- Tab switcher -->
      <div class="tabs-row" style="margin-top: 16px;">
        <button
          class="tab-btn ${state.profileTab === "template" ? "active" : ""}"
          @click=${() => props.onTabChange("template")}
        >
          Profile Templates
        </button>
        <button
          class="tab-btn ${state.profileTab === "edit" ? "active" : ""}"
          @click=${() => {
            props.onTabChange("edit");
            props.onEditLoad();
          }}
        >
          Profile Edit
        </button>
      </div>

      <!-- Template tab -->
      ${
        state.profileTab === "template"
          ? html`
            <div style="margin-top: 16px;">
              <div class="card-sub" style="margin-bottom: 12px;">
                Select a role template to pre-fill your profile details.
              </div>
              ${renderTemplateSelect(state, props.onTemplateSelect)}
              ${
                state.profileTemplateId
                  ? html`
                    <div style="margin-top: 20px;">
                      ${renderTemplateForm(state, props.onFieldChange)}
                      <button
                        class="btn primary"
                        style="margin-top: 16px;"
                        @click=${props.onTemplatePreview}
                      >
                        Preview & Save
                      </button>
                    </div>
                  `
                  : nothing
              }
            </div>
          `
          : nothing
      }

      <!-- Profile Edit tab -->
      ${
        state.profileTab === "edit"
          ? html`
            <div style="margin-top: 16px;">
              ${
                state.profileEditLoading
                  ? html`
                      <div class="muted" style="padding: 24px 0; text-align: center">Loading profile files…</div>
                    `
                  : html`
                    <!-- USER.md section -->
                    ${renderEditSection(
                      "USER.md",
                      state.profileEditUserMd,
                      state.profileEditViewMode,
                      props.onEditViewModeChange,
                      props.onEditUserMdChange,
                    )}

                    <!-- MEMORY.md section -->
                    ${renderEditSection(
                      "MEMORY.md",
                      state.profileEditMemoryMd,
                      state.profileEditViewMode,
                      props.onEditViewModeChange,
                      props.onEditMemoryMdChange,
                    )}

                    <!-- Save direct edits button -->
                    ${
                      state.profileEditUserMd || state.profileEditMemoryMd
                        ? html`
                          <button
                            class="btn primary"
                            style="margin-bottom: 16px;"
                            ?disabled=${state.profileSaving}
                            @click=${props.onEditSaveDirect}
                          >
                            ${state.profileSaving ? "Saving…" : "Save Changes"}
                          </button>
                        `
                        : nothing
                    }

                    <!-- Add from text/URL section -->
                    <div style="margin-top: 4px; border-top: 1px solid var(--border, #e0e0e0); padding-top: 16px;">
                      <button
                        class="btn"
                        style="margin-bottom: 12px; display:flex; align-items:center; gap:6px;"
                        @click=${() => props.onEditInputToggle(!state.profileEditInputOpen)}
                      >
                        <span>${state.profileEditInputOpen ? "▲" : "▼"}</span>
                        <span>${state.profileEditInputOpen ? "Hide" : "Add from Text / URL"}</span>
                      </button>

                      ${
                        state.profileEditInputOpen
                          ? html`
                            <label class="field">
                              <span>Text or URLs</span>
                              <textarea
                                rows="5"
                                placeholder="Paste your bio, website URL, or any description about yourself…"
                                .value=${state.profileFreeInput}
                                @input=${(e: Event) =>
                                  props.onFreeInputChange((e.target as HTMLTextAreaElement).value)}
                              ></textarea>
                            </label>
                            <button
                              class="btn primary"
                              style="margin-top: 10px;"
                              ?disabled=${state.profileLoading}
                              @click=${props.onFreeInputParse}
                            >
                              ${state.profileLoading ? "Analyzing…" : "Analyze & Append"}
                            </button>
                          `
                          : nothing
                      }
                    </div>
                  `
              }
            </div>
          `
          : nothing
      }
    </section>

    <!-- Preview modal -->
    ${renderPreviewModal(
      state,
      props.onPreviewClose,
      props.onSave,
      props.onPreviewModeChange,
      props.onPreviewDraftChange,
    )}
  `;
}
