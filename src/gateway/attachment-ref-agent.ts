import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ChatAttachmentRef } from "./server-methods/attachment-normalize.js";

export type AttachmentIntent = "read-extract" | "edit-convert" | "unknown";

export function classifyAttachmentIntent(text: string): AttachmentIntent {
  const normalized = text.toLowerCase();
  const editConvertKeywords = [
    "convert",
    "transform",
    "edit",
    "rewrite",
    "update",
    "modify",
    "export",
    "to pdf",
    "to docx",
    "to pptx",
    "to xlsx",
  ];
  const readExtractKeywords = [
    "read",
    "extract",
    "summarize",
    "summary",
    "analyze",
    "analysis",
    "classify",
    "identify",
  ];
  if (editConvertKeywords.some((kw) => normalized.includes(kw))) {
    return "edit-convert";
  }
  if (readExtractKeywords.some((kw) => normalized.includes(kw))) {
    return "read-extract";
  }
  return "unknown";
}

function sanitizeStagingFileName(fileName: string): string {
  const trimmed = fileName.trim() || "file";
  const sanitized = trimmed.replace(/[^\w.-]/g, "_");
  return sanitized.length > 0 ? sanitized : "file";
}

/** D7: edit-convert always stages; PDF/images stage on unknown intent; read-extract never stages. */
export function shouldStagePathRefForIntent(params: {
  ref: ChatAttachmentRef;
  intent: AttachmentIntent;
}): boolean {
  if (params.intent === "read-extract") {
    return false;
  }
  if (params.intent === "edit-convert") {
    return true;
  }
  const mime = params.ref.mimeType?.trim().toLowerCase() || "";
  return mime === "application/pdf" || mime.startsWith("image/");
}

export async function stageAttachmentRefsForEditIntent(params: {
  refs: ChatAttachmentRef[];
  userText: string;
  cfg: OpenClawConfig;
  agentId: string;
  runId: string;
}): Promise<{ refs: ChatAttachmentRef[]; staged: boolean }> {
  const intent = classifyAttachmentIntent(params.userText);
  if (params.refs.length === 0) {
    return { refs: params.refs, staged: false };
  }

  const refsNeedingStage = params.refs.filter((ref) =>
    shouldStagePathRefForIntent({ ref, intent }),
  );
  if (refsNeedingStage.length === 0) {
    return { refs: params.refs, staged: false };
  }

  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
  const stagingRoot = path.join(workspaceDir, "attachments", "staging", params.runId);
  await fs.mkdir(stagingRoot, { recursive: true });

  const stagedPathsByFileId = new Map<string, string>();
  for (const ref of refsNeedingStage) {
    const sourcePath = path.resolve(ref.path);
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) {
      throw new Error(`attachment source is not a file: ${ref.fileName || ref.path}`);
    }
    const safeName = sanitizeStagingFileName(ref.fileName);
    const destPath = path.join(stagingRoot, `${ref.fileId}_${safeName}`);
    await fs.copyFile(sourcePath, destPath);
    stagedPathsByFileId.set(ref.fileId, destPath);
  }

  const agentRefs = params.refs.map((ref) => {
    const stagedPath = stagedPathsByFileId.get(ref.fileId);
    return stagedPath ? { ...ref, path: stagedPath } : ref;
  });

  return { refs: agentRefs, staged: true };
}

export function buildStagedPathMaps(params: {
  originalRefs: ChatAttachmentRef[];
  agentRefs: ChatAttachmentRef[];
}): {
  stagingRevealPathsByFileId: Map<string, string>;
  stagedSourcePathsByFileId: Map<string, string>;
} {
  const stagingRevealPathsByFileId = new Map<string, string>();
  const stagedSourcePathsByFileId = new Map<string, string>();
  const originalsById = new Map(params.originalRefs.map((ref) => [ref.fileId, ref] as const));
  for (const agentRef of params.agentRefs) {
    const original = originalsById.get(agentRef.fileId);
    if (original && original.path !== agentRef.path) {
      stagingRevealPathsByFileId.set(agentRef.fileId, agentRef.path);
      stagedSourcePathsByFileId.set(agentRef.fileId, original.path);
    }
  }
  return { stagingRevealPathsByFileId, stagedSourcePathsByFileId };
}

export function formatAttachmentRefsForAgent(params: {
  refs: ChatAttachmentRef[];
  stagedSourcePathsByFileId?: Map<string, string>;
}): string {
  if (params.refs.length === 0) {
    return "";
  }
  const stagedSources = params.stagedSourcePathsByFileId ?? new Map<string, string>();
  const anyStaged = stagedSources.size > 0;
  const lines = params.refs.map((ref) => {
    const sourcePath = stagedSources.get(ref.fileId);
    const sourceSuffix = sourcePath ? `; sourcePath=${sourcePath}` : "";
    return `- fileId=${ref.fileId}; path=${ref.path}; name=${ref.fileName || "file"}; mime=${ref.mimeType || "unknown"}; size=${ref.size}; sha256=${ref.sha256 || "unknown"}${sourceSuffix}`;
  });
  if (anyStaged) {
    return [
      "Uploaded File References (staged copies where noted):",
      "Use staged copy paths when invoking file tools (read/write/edit/convert).",
      "Do not modify the user's original files at the sourcePath values.",
      ...lines,
    ].join("\n");
  }
  return [
    "Uploaded File References:",
    "Use these exact local file paths when invoking file tools (read/write/edit/convert).",
    ...lines,
  ].join("\n");
}

export function buildAttachmentRoutingHint(params: {
  refs: ChatAttachmentRef[];
  userText: string;
  staged?: boolean;
}): string {
  if (params.refs.length === 0) {
    return "";
  }
  if (params.staged) {
    return "Routing hint: this request looks like editing/conversion. Operate on the staged copy paths below; do not write to sourcePath originals.";
  }
  const intent = classifyAttachmentIntent(params.userText);
  if (intent === "edit-convert") {
    return "Routing hint: this request looks like editing/conversion. Prefer file-edit/convert skills and operate on the referenced file paths directly.";
  }
  if (intent === "read-extract") {
    return "Routing hint: this request looks like reading/extraction. Prefer read/extract tools on the referenced file paths.";
  }
  return "Routing hint: attachments are in reference mode. Prefer tools that read/modify files via the referenced local file paths.";
}
