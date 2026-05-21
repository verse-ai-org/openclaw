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
  // file uploads
  profileFiles: Array<{ name: string; content: string }>; // base64 encoded content
  profileFilesMaxCount: number;
  profileFilesMaxSize: number; // in bytes
  // async state
  profileLoading: boolean;
  profileError: string | null;
  // preview modal
  profilePreviewOpen: boolean;
  profilePreviewUserMd: string;
  profilePreviewMemoryMd: string;
  profilePreviewSkippedUrls: string[];
  profilePreviewSkippedFiles: string[];
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
  // For cancel functionality: store original content before analyze
  profileEditUserMdOriginal: string;
  profileEditMemoryMdOriginal: string;
  // Invite code verification
  inviteCode: string;
  inviteCodeVerifying: boolean;
  inviteCodeVerified: boolean;
  inviteCodeError: string | null;
  llmApiKey: string | null;
  llmModel: string | null;
  profileEditHasAnalyzed: boolean;
  // Template tab: read-only USER.md preview
  profileTemplateUserMd: string;
  profileTemplateUserMdLoading: boolean;
  profileTemplateUserMdViewMode: "preview" | "edit";
  profileTemplateUserMdDraft: string;
  // Tag input dialogs
  profileDomainDialogOpen: boolean;
  profileToolDialogOpen: boolean;
  profilePreferenceDialogOpen: boolean;
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

/** Format bytes to human readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/** Get file icon based on extension */
function getFileIcon(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".md":
      return "📝";
    case ".doc":
    case ".docx":
      return "📄";
    case ".pdf":
      return "📑";
    default:
      return "📎";
  }
}

/** Handle file selection from input or drop */
async function handleFileSelect(
  files: FileList,
  state: ProfileState,
  onFileSelect: (files: Array<{ name: string; content: string }>) => void,
): Promise<void> {
  const supportedExts = new Set([".md", ".doc", ".docx", ".pdf"]);
  const newFiles: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    // Check file count limit
    if (state.profileFiles.length + newFiles.length >= state.profileFilesMaxCount) {
      break;
    }

    // Check file type
    if (!supportedExts.has(ext)) {
      continue;
    }

    // Check file size
    if (file.size > state.profileFilesMaxSize) {
      continue;
    }

    // Read file as base64
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          const result = reader.result as string;
          // Extract base64 content from data URL
          const base64 = result.split(",")[1];
          resolve(base64);
        });
        reader.addEventListener("error", () => reject(new Error("Failed to read file")));
        reader.readAsDataURL(file);
      });
      newFiles.push({ name: file.name, content });
    } catch {
      // Skip files that fail to read
    }
  }

  if (newFiles.length > 0) {
    onFileSelect([...state.profileFiles, ...newFiles]);
  }
}

// Parse ROLE from existing USER.md content
function parseRoleFromUserMd(content: string): string | null {
  if (!content) {
    return null;
  }
  const roleMatch = content.match(/\*\*Role\*\*:\s*(.+)/i);
  return roleMatch?.[1]?.trim() || null;
}

// Find template ID by role name (case-insensitive partial match)
function findTemplateIdByRole(role: string): string | null {
  if (!role) {
    return null;
  }
  const normalizedRole = role.toLowerCase();
  // Try exact match first
  const exactMatch = PROFILE_TEMPLATES.find((t) => t.defaultRole.toLowerCase() === normalizedRole);
  if (exactMatch) {
    return exactMatch.id;
  }
  // Try partial match (role contains template role or vice versa)
  const partialMatch = PROFILE_TEMPLATES.find(
    (t) =>
      normalizedRole.includes(t.defaultRole.toLowerCase()) ||
      t.defaultRole.toLowerCase().includes(normalizedRole),
  );
  if (partialMatch) {
    return partialMatch.id;
  }
  return null;
}

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

export async function handleProfileTemplateSave(state: ProfileState): Promise<void> {
  if (!state.profileTemplateId) {
    state.profileError = "Please select a template first.";
    return;
  }
  const userMd = buildUserMdSection(state);
  await handleProfileSave(state, userMd, "");
}

export async function handleProfileFreeInputParse(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    state.profileError = "Not connected to Server.";
    return;
  }
  const text = state.profileFreeInput.trim();
  const hasFiles = state.profileFiles.length > 0;
  if (!text && !hasFiles) {
    state.profileError = "Please enter some text, URLs, or upload files.";
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
      skippedFiles?: string[];
    } | null>("profile.parse", {
      text: textOnly || undefined,
      urls: urls.length > 0 ? urls : undefined,
      files: hasFiles ? state.profileFiles : undefined,
    });
    if (!result) {
      state.profileError = "Gateway returned no result.";
      return;
    }

    if (state.profileTab === "edit") {
      // In edit tab: save original content first, then overwrite with parsed content
      state.profileEditUserMdOriginal = state.profileEditUserMd;
      state.profileEditMemoryMdOriginal = state.profileEditMemoryMd;
      state.profileEditUserMd = result.userMdContent ?? "";
      state.profileEditMemoryMd = result.memoryContent ?? "";
      state.profileEditHasAnalyzed = true;
      // Keep input area open so user can see the result and decide to save or cancel
      state.profileFreeInput = "";
      state.profileFiles = []; // Clear files after successful parse
    } else {
      // In template tab: overwrite content directly (no preview modal)
      await handleProfileSave(state, result.userMdContent ?? "", result.memoryContent ?? "");
      state.profileFreeInput = "";
      state.profileFiles = []; // Clear files after successful save
    }

    const warnings: string[] = [];
    if (result.skippedUrls && result.skippedUrls.length > 0) {
      warnings.push(`Could not fetch URLs: ${result.skippedUrls.join(", ")}`);
    }
    if (result.skippedFiles && result.skippedFiles.length > 0) {
      warnings.push(`Could not process files: ${result.skippedFiles.join(", ")}`);
    }
    if (warnings.length > 0) {
      state.profileError = `⚠️ ${warnings.join("; ")}`;
    }
  } catch (err) {
    state.profileError = String(err);
  } finally {
    state.profileLoading = false;
  }
}

export function handleProfileEditCancel(state: ProfileState): void {
  // Restore original content
  state.profileEditUserMd = state.profileEditUserMdOriginal;
  state.profileEditMemoryMd = state.profileEditMemoryMdOriginal;
  state.profileEditHasAnalyzed = false;
  state.profileEditUserMdOriginal = "";
  state.profileEditMemoryMdOriginal = "";
  state.profileError = null;
}

export async function handleProfileSave(
  state: ProfileState,
  userMd: string,
  memoryMd: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    state.profileError = "Not connected to Server.";
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";

  state.profileSaving = true;
  state.profileError = null;
  try {
    // Save USER.md (overwrite mode)
    if (userMd.trim()) {
      await state.client.request("agents.files.set", {
        agentId,
        name: "USER.md",
        content: userMd.trim(),
      });
    }
    // Save MEMORY.md if provided (overwrite mode)
    if (memoryMd.trim()) {
      await state.client.request("agents.files.set", {
        agentId,
        name: "MEMORY.md",
        content: memoryMd.trim(),
      });
    }
    state.profilePreviewOpen = false;
    state.profileSaveSuccess = true;
    // Refresh content after save
    await handleProfileTemplateLoad(state);
    await handleProfileEditLoad(state);
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

// Save USER.md from template page edit mode
export async function handleProfileTemplateUserMdSave(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    state.profileError = "Not connected to Server.";
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";
  state.profileSaving = true;
  state.profileError = null;
  try {
    await state.client.request("agents.files.set", {
      agentId,
      name: "USER.md",
      content: state.profileTemplateUserMdDraft,
    });
    state.profileTemplateUserMd = state.profileTemplateUserMdDraft;
    state.profileTemplateUserMdViewMode = "preview";
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

// Load current USER.md / MEMORY.md into edit tab
export async function handleProfileEditLoad(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";
  state.profileEditLoading = true;
  state.profileError = null;
  // Ensure we're in edit tab mode so analyze doesn't auto-save
  state.profileTab = "edit";
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
    state.profileError = "Not connected to Server.";
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

// Load USER.md for read-only preview in template tab
export async function handleProfileTemplateLoad(state: ProfileState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const agentId = state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";
  // Load USER.md
  state.profileTemplateUserMdLoading = true;
  try {
    const res = await state.client.request<{
      file?: { content?: string };
    } | null>("agents.files.get", { agentId, name: "USER.md" });
    const content = res?.file?.content ?? "";
    state.profileTemplateUserMd = content;
    state.profileTemplateUserMdDraft = content;

    // Auto-select template based on ROLE from USER.md
    const role = parseRoleFromUserMd(content);
    if (role) {
      const templateId = findTemplateIdByRole(role);
      if (templateId && !state.profileTemplateId) {
        // Only auto-select if no template is currently selected
        await handleProfileTemplateSelect(state, templateId);
      }
    }
    // If no template selected yet (no ROLE match), select first template as fallback
    if (!state.profileTemplateId && PROFILE_TEMPLATES.length > 0) {
      await handleProfileTemplateSelect(state, PROFILE_TEMPLATES[0].id);
    }
  } catch {
    state.profileTemplateUserMd = "";
    state.profileTemplateUserMdDraft = "";
    // On error, still select first template as fallback
    if (!state.profileTemplateId && PROFILE_TEMPLATES.length > 0) {
      await handleProfileTemplateSelect(state, PROFILE_TEMPLATES[0].id);
    }
  } finally {
    state.profileTemplateUserMdLoading = false;
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

function renderTagInput(
  values: string[],
  onChange: (next: string[]) => void,
  label: string,
  dialogOpen: boolean,
  onDialogOpen: () => void,
  onDialogClose: () => void,
) {
  const removeValue = (val: string) => {
    onChange(values.filter((v) => v !== val));
  };

  return html`
    <div class="tag-input-wrap">
      <!-- existing chips -->
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
        <!-- Add button chip -->
        <button
          class="chip add-chip"
          @click=${onDialogOpen}
          style="cursor:pointer; background:var(--surface-2, #f0f0f0); border-style:dashed;"
        >
          + Add ${label}
        </button>
      </div>

      <!-- Add dialog -->
      ${
        dialogOpen
          ? html`
            <div
              class="tag-add-dialog"
              style="
                margin-top: 8px;
                padding: 12px;
                background: var(--surface-2, #f9f9f9);
                border: 1px solid var(--border, #e0e0e0);
                border-radius: 6px;
              "
            >
              <div style="display:flex; gap:8px; align-items:center;">
                <input
                  class="tag-input"
                  style="flex:1;"
                  placeholder="Enter ${label.toLowerCase()}..."
                  id="tag-input-${label.toLowerCase().replace(/\s+/g, "-")}"
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const target = e.target as HTMLInputElement;
                      const val = target.value.trim();
                      if (val && !values.includes(val)) {
                        onChange([...values, val]);
                        target.value = "";
                      }
                    }
                  }}
                />
                <button
                  class="btn primary"
                  style="padding:4px 12px;"
                  @click=${(e: Event) => {
                    const dialog = (e.target as HTMLElement).closest(".tag-add-dialog");
                    const input = dialog?.querySelector("input") as HTMLInputElement | null;
                    if (input) {
                      const val = input.value.trim();
                      if (val && !values.includes(val)) {
                        onChange([...values, val]);
                        input.value = "";
                        input.focus();
                      }
                    }
                  }}
                >
                  Add
                </button>
                <button class="btn" @click=${onDialogClose}>Cancel</button>
              </div>
            </div>
          `
          : nothing
      }
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
  onDomainDialogOpen: () => void,
  onDomainDialogClose: () => void,
  onToolDialogOpen: () => void,
  onToolDialogClose: () => void,
  onPreferenceDialogOpen: () => void,
  onPreferenceDialogClose: () => void,
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
          "Domain",
          state.profileDomainDialogOpen,
          onDomainDialogOpen,
          onDomainDialogClose,
        )}
      </div>
      <div class="field">
        <span>Tools</span>
        ${renderTagInput(
          state.profileFormTools,
          (next) => onChange("profileFormTools", next),
          "Tool",
          state.profileToolDialogOpen,
          onToolDialogOpen,
          onToolDialogClose,
        )}
      </div>
      <div class="field">
        <span>Preferences</span>
        ${renderTagInput(
          state.profileFormPreferences,
          (next) => onChange("profileFormPreferences", next),
          "Preference",
          state.profilePreferenceDialogOpen,
          onPreferenceDialogOpen,
          onPreferenceDialogClose,
        )}
      </div>
    </div>
  `;
}

// ─── Profile Home (Entry Point) ───────────────────────────────────────────────

export type ProfileHomeProps = {
  onNavigateToTemplates: () => void;
  onNavigateToEdit: () => void;
  state: ProfileState;
  onInviteCodeInput: (code: string) => void;
  onInviteCodeVerify: () => void;
};

export function renderProfileHome(props: ProfileHomeProps) {
  return html`
    <section class="card">
      <div class="card-title">Profile</div>
      <div class="card-sub">Manage your personal profile and memory files.</div>

      <!-- Invite Code Verification Section -->
      <div
        style="
          background: var(--surface-2, #f9f9f9);
          border: 1px solid var(--border, #e0e0e0);
          border-radius: 8px;
          padding: 20px;
          margin: 24px 0;
        "
      >
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 12px;">
          🔐 Invite Code Verification
        </div>
        <div class="muted" style="font-size: 13px; margin-bottom: 16px; line-height: 1.5;">
          Enter your invite code to get access to LLM API key and model configuration.
        </div>
        
        <div style="display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap;">
          <input
            type="text"
            .value=${props.state.inviteCode}
            placeholder="Enter your invite code..."
            style="
              flex: 1;
              min-width: 200px;
              padding: 8px 12px;
              border: 1px solid var(--border, #e0e0e0);
              border-radius: 4px;
              font-size: 14px;
            "
            @input=${(e: Event) => props.onInviteCodeInput((e.target as HTMLInputElement).value)}
            ?disabled=${props.state.inviteCodeVerifying}
          />
          <button
            class="btn primary"
            ?disabled=${!props.state.inviteCode.trim() || props.state.inviteCodeVerifying}
            @click=${props.onInviteCodeVerify}
            style="white-space: nowrap;"
          >
            ${props.state.inviteCodeVerifying ? "Verifying..." : "Verify Code"}
          </button>
        </div>
        
        ${props.state.inviteCodeVerified
          ? html`
              <div class="callout ok" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                <span>✓</span>
                <span>Invite code verified successfully!</span>
                ${props.state.llmApiKey || props.state.llmModel
                  ? html`
                      <div style="margin-top: 8px; font-size: 12px;">
                        ${props.state.llmApiKey
                          ? html`<div><strong>API Key:</strong> ${props.state.llmApiKey.substring(0, 10)}...</div>`
                          : nothing}
                        ${props.state.llmModel
                          ? html`<div><strong>Model:</strong> ${props.state.llmModel}</div>`
                          : nothing}
                      </div>
                    `
                  : nothing}
              </div>
            `
          : nothing}
        
        ${props.state.inviteCodeError
          ? html`
              <div class="callout danger" style="margin-top: 12px;">
                ${props.state.inviteCodeError}
              </div>
            `
          : nothing}
      </div>

      <div
        style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 24px;"
      >
        <!-- Templates Card -->
        <div
          class="profile-entry-card"
          style="
            padding: 24px;
            background: var(--surface-2, #f9f9f9);
            border: 1px solid var(--border, #e0e0e0);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
          "
          @click=${props.onNavigateToTemplates}
        >
          <div
            style="font-size: 32px; margin-bottom: 12px; text-align: center;"
          >
            📋
          </div>
          <div
            style="font-weight: 600; font-size: 16px; margin-bottom: 8px; text-align: center;"
          >
            Profile Templates
          </div>
          <div
            class="muted"
            style="font-size: 13px; text-align: center; line-height: 1.5;"
          >
            Choose from preset role templates to quickly set up your profile.
            View your current USER.md and customize your profile details.
          </div>
          <div style="text-align: center; margin-top: 16px;">
            <button class="btn primary">Get Started</button>
          </div>
        </div>

        <!-- Edit Card -->
        <div
          class="profile-entry-card"
          style="
            padding: 24px;
            background: var(--surface-2, #f9f9f9);
            border: 1px solid var(--border, #e0e0e0);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
          "
          @click=${props.onNavigateToEdit}
        >
          <div
            style="font-size: 32px; margin-bottom: 12px; text-align: center;"
          >
            ✏️
          </div>
          <div
            style="font-weight: 600; font-size: 16px; margin-bottom: 8px; text-align: center;"
          >
            Profile Edit
          </div>
          <div
            class="muted"
            style="font-size: 13px; text-align: center; line-height: 1.5;"
          >
            Directly edit your USER.md and MEMORY.md files. Add content from
            text or URLs.
          </div>
          <div style="text-align: center; margin-top: 16px;">
            <button class="btn primary">Edit Files</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ─── Profile Templates Page ───────────────────────────────────────────────────

export type ProfileTemplatesProps = {
  state: ProfileState;
  onBack: () => void;
  onTemplateSelect: (id: string) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onTemplateSave: () => void;
  onTemplateLoad: () => void;
  onDomainDialogOpen: () => void;
  onDomainDialogClose: () => void;
  onToolDialogOpen: () => void;
  onToolDialogClose: () => void;
  onPreferenceDialogOpen: () => void;
  onPreferenceDialogClose: () => void;
  // Template page USER.md view mode
  onTemplateUserMdViewModeChange: (mode: "preview" | "edit") => void;
  onTemplateUserMdDraftChange: (value: string) => void;
  onTemplateUserMdSave: () => void;
};

export function renderProfileTemplates(props: ProfileTemplatesProps) {
  const { state } = props;

  return html`
    <section class="card">
      <!-- Header with back button -->
      <div
        style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;"
      >
        <button class="btn" style="padding: 6px 12px;" @click=${props.onBack}>
          ← Back
        </button>
        <div class="card-title" style="margin: 0;">Profile Templates</div>
      </div>
      <div class="card-sub">Choose a template and customize your profile.</div>

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

      <div style="margin-top: 20px;">
        <!-- USER.md preview/edit (at top) -->
        ${
          state.profileTemplateUserMdLoading
            ? html`
                <div class="muted" style="padding: 12px 0">Loading USER.md…</div>
              `
            : state.profileTemplateUserMd
              ? html`
              <div style="margin-bottom: 20px;">
                <div
                  style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;"
                >
                  <div
                    style="font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px;"
                  >
                    <span>📄</span>
                    <span>Current USER.md</span>
                  </div>
                  <div style="display:flex; gap:4px;">
                    <button
                      class="btn btn-xs ${
                        state.profileTemplateUserMdViewMode === "preview" ? "active" : ""
                      }"
                      style="padding:2px 8px; font-size:12px;"
                      @click=${() => props.onTemplateUserMdViewModeChange("preview")}
                    >
                      Preview
                    </button>
                    <button
                      class="btn btn-xs ${
                        state.profileTemplateUserMdViewMode === "edit" ? "active" : ""
                      }"
                      style="padding:2px 8px; font-size:12px;"
                      @click=${() => props.onTemplateUserMdViewModeChange("edit")}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                ${
                  state.profileTemplateUserMdViewMode === "preview"
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
                        max-height: 200px;
                      "
                    >
                      ${unsafeHTML(toSanitizedMarkdownHtml(state.profileTemplateUserMd))}
                    </div>`
                    : html`<textarea
                        rows="10"
                        style="
                        font-family: monospace;
                        font-size: 13px;
                        width: 100%;
                        box-sizing: border-box;
                        max-height: 200px;
                      "
                        .value=${state.profileTemplateUserMdDraft}
                        @input=${(e: Event) =>
                          props.onTemplateUserMdDraftChange(
                            (e.target as HTMLTextAreaElement).value,
                          )}
                      ></textarea>
                      <button
                        class="btn primary"
                        style="margin-top: 8px;"
                        @click=${props.onTemplateUserMdSave}
                      >
                        Save USER.md
                      </button> `
                }
              </div>
            `
              : html`
                  <div
                    class="muted"
                    style="
                      margin-bottom: 20px;
                      padding: 16px;
                      background: var(--surface-2, #f9f9f9);
                      border: 1px dashed var(--border, #e0e0e0);
                      border-radius: 6px;
                      font-size: 13px;
                      text-align: center;
                    "
                  >
                    No USER.md found. Select a template below to create your profile.
                  </div>
                `
        }

        <div class="card-sub" style="margin-bottom: 12px; margin-top: 20px;">
          Select a role template to pre-fill your profile details.
        </div>
        ${renderTemplateSelect(state, props.onTemplateSelect)}
        ${
          state.profileTemplateId
            ? html`
              <div style="margin-top: 20px;">
                ${renderTemplateForm(
                  state,
                  props.onFieldChange,
                  props.onDomainDialogOpen,
                  props.onDomainDialogClose,
                  props.onToolDialogOpen,
                  props.onToolDialogClose,
                  props.onPreferenceDialogOpen,
                  props.onPreferenceDialogClose,
                )}
                <button
                  class="btn primary"
                  style="margin-top: 16px;"
                  ?disabled=${state.profileSaving}
                  @click=${props.onTemplateSave}
                >
                  ${state.profileSaving ? "Saving…" : "Save"}
                </button>
              </div>
            `
            : nothing
        }
      </div>
    </section>
  `;
}

// ─── Profile Edit Page ────────────────────────────────────────────────────────

export type ProfileEditProps = {
  state: ProfileState;
  onBack: () => void;
  onEditLoad: () => void;
  onEditViewModeChange: (mode: "preview" | "edit") => void;
  onEditUserMdChange: (value: string) => void;
  onEditMemoryMdChange: (value: string) => void;
  onEditSaveDirect: () => void;
  onEditCancel: () => void;
  onEditInputToggle: (open: boolean) => void;
  onFreeInputChange: (text: string) => void;
  onFreeInputParse: () => void;
  onFileSelect: (files: Array<{ name: string; content: string }>) => void;
  onFileRemove: (index: number) => void;
};

export function renderProfileEdit(props: ProfileEditProps) {
  const { state } = props;

  return html`
    <section class="card">
      <!-- Header with back button -->
      <div
        style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;"
      >
        <button class="btn" style="padding: 6px 12px;" @click=${props.onBack}>
          ← Back
        </button>
        <div class="card-title" style="margin: 0;">Profile Edit</div>
      </div>
      <div class="card-sub">Directly edit your profile and memory files.</div>

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

      <div style="margin-top: 20px;">
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
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                      <button
                        class="btn primary"
                        ?disabled=${state.profileSaving}
                        @click=${props.onEditSaveDirect}
                      >
                        ${state.profileSaving ? "Saving…" : "Save Changes"}
                      </button>
                      ${
                        state.profileEditHasAnalyzed
                          ? html`
                            <button
                              class="btn"
                              ?disabled=${state.profileSaving}
                              @click=${props.onEditCancel}
                            >
                              Cancel
                            </button>
                          `
                          : nothing
                      }
                    </div>
                  `
                  : nothing
              }

              <!-- Add from text/URL/File section -->
              <div
                style="margin-top: 4px; border-top: 1px solid var(--border, #e0e0e0); padding-top: 16px;"
              >
                <div
                  style="font-size: 13px; color: var(--text-muted, #666); margin-bottom: 12px;"
                >
                  Add from Text/URL or File
                  <span style="color: var(--text-muted, #999);"
                    >(choose one or both)</span
                  >
                </div>

                <label class="field">
                  <span
                    >Text or URLs
                    <span
                      style="font-weight: normal; color: var(--text-muted, #999);"
                      >(optional)</span
                    ></span
                  >
                  <textarea
                    rows="5"
                    placeholder="Paste your bio, website URL, or any description about yourself…"
                    .value=${state.profileFreeInput}
                    @input=${(e: Event) =>
                      props.onFreeInputChange((e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </label>

                <!-- File upload section -->
                <div class="field" style="margin-top: 16px;">
                  <span
                    >Files
                    <span
                      style="font-weight: normal; color: var(--text-muted, #999);"
                      >(optional)</span
                    ></span
                  >
                  <div
                    style="
                      border: 2px dashed var(--border, #e0e0e0);
                      border-radius: 6px;
                      padding: 16px;
                      text-align: center;
                      background: var(--surface-2, #f9f9f9);
                      cursor: pointer;
                      transition: border-color 0.2s;
                    "
                    @dragover=${(e: DragEvent) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "var(--primary, #0066cc)";
                    }}
                    @dragleave=${(e: DragEvent) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border, #e0e0e0)";
                    }}
                    @drop=${(e: DragEvent) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border, #e0e0e0)";
                      const files = e.dataTransfer?.files;
                      if (files) {
                        void handleFileSelect(files, state, props.onFileSelect);
                      }
                    }}
                    @click=${() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.multiple = true;
                      input.accept = ".md,.doc,.docx,.pdf";
                      input.addEventListener("change", (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) {
                          void handleFileSelect(files, state, props.onFileSelect);
                        }
                      });
                      input.click();
                    }}
                  >
                    <div style="font-size: 24px; margin-bottom: 8px;">📁</div>
                    <div
                      style="font-size: 13px; color: var(--text-muted, #666);"
                    >
                      Click to select or drag files here
                    </div>
                    <div
                      style="font-size: 12px; color: var(--text-muted, #999); margin-top: 4px;"
                    >
                      Supports: .md, .doc, .docx, .pdf
                    </div>
                    <div
                      style="font-size: 11px; color: var(--text-muted, #999); margin-top: 2px;"
                    >
                      Max ${state.profileFilesMaxCount} files,
                      ${formatBytes(state.profileFilesMaxSize)} each
                    </div>
                  </div>

                  <!-- Selected files list -->
                  ${
                    state.profileFiles.length > 0
                      ? html`
                        <div style="margin-top: 12px;">
                          ${state.profileFiles.map(
                            (file, index) => html`
                              <div
                                style="
                                  display: flex;
                                  align-items: center;
                                  justify-content: space-between;
                                  padding: 8px 12px;
                                  background: var(--surface-1, #fff);
                                  border: 1px solid var(--border, #e0e0e0);
                                  border-radius: 4px;
                                  margin-bottom: 6px;
                                  font-size: 13px;
                                "
                              >
                                <span
                                  style="display: flex; align-items: center; gap: 6px;"
                                >
                                  <span>${getFileIcon(file.name)}</span>
                                  <span
                                    style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                                  >
                                    ${file.name}
                                  </span>
                                </span>
                                <button
                                  class="btn btn-xs"
                                  style="padding: 2px 8px; font-size: 12px;"
                                  @click=${() => props.onFileRemove(index)}
                                >
                                  ✕
                                </button>
                              </div>
                            `,
                          )}
                        </div>
                      `
                      : nothing
                  }
                </div>

                <div style="margin-top: 16px;">
                  <button
                    class="btn primary"
                    ?disabled=${
                      state.profileLoading ||
                      (state.profileFreeInput.trim() === "" && state.profileFiles.length === 0)
                    }
                    @click=${props.onFreeInputParse}
                  >
                    ${state.profileLoading ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
              </div>
            `
        }
      </div>
    </section>
  `;
}
