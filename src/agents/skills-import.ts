import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { assertCanonicalPathWithinBase } from "../infra/install-safe-path.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { scanDirectoryWithSummary } from "../security/skill-scanner.js";
import { ensureDir, CONFIG_DIR } from "../utils.js";
import type { DownloadUrlResult } from "./skills-install-download.js";
import { downloadUrlToFile } from "./skills-install-download.js";
import { extractArchive } from "./skills-install-extract.js";

export type SkillImportRequest = {
  kind: "url" | "upload";
  /** For kind=url: the remote URL to fetch */
  url?: string;
  /** For kind=upload: base64-encoded file content */
  data?: string;
  /** For kind=upload: original filename (used to detect archive type) */
  filename?: string;
  /** Override the destination skill directory name */
  skillName?: string;
  timeoutMs?: number;
  /**
   * Base directory under which the skill sub-directory will be created.
   * Defaults to ~/.openclaw/skills (managed). Pass workspaceDir/skills for
   * workspace-scoped installs.
   */
  skillsBaseDir?: string;
};

export type SkillImportResult = {
  ok: boolean;
  message: string;
  skillName?: string;
  destDir?: string;
  warnings?: string[];
};

const ALLOWED_EXTENSIONS = [".zip", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2"];

function detectArchiveTypeFromName(filename: string): string | undefined {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    return "tar.gz";
  }
  if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) {
    return "tar.bz2";
  }
  if (lower.endsWith(".zip")) {
    return "zip";
  }
  return undefined;
}

/**
 * Try to detect archive type from HTTP response headers:
 * Content-Disposition filename, then Content-Type.
 */
function detectArchiveTypeFromHeaders(headers: DownloadUrlResult): string | undefined {
  // Try Content-Disposition: attachment; filename="foo.zip"
  const cd = headers.contentDisposition;
  if (cd) {
    const match = /filename\*?=["']?(?:UTF-8'')?([^"';\s]+)/i.exec(cd);
    if (match?.[1]) {
      const t = detectArchiveTypeFromName(decodeURIComponent(match[1]));
      if (t) {
        return t;
      }
    }
  }
  // Try Content-Type
  const ct = headers.contentType?.toLowerCase() ?? "";
  if (ct.includes("zip") || ct.includes("x-zip") || ct.includes("octet-stream+zip")) {
    return "zip";
  }
  if (ct.includes("gzip") || ct.includes("x-tar") || ct.includes("tar")) {
    return "tar.gz";
  }
  if (ct.includes("bzip2") || ct.includes("x-bzip2")) {
    return "tar.bz2";
  }
  return undefined;
}

/**
 * Detect archive type from the first few bytes (magic numbers).
 * ZIP: starts with PK (0x50 0x4B)
 * gzip: starts with 0x1F 0x8B
 * bzip2: starts with BZ (0x42 0x5A)
 */
async function detectArchiveTypeFromMagic(filePath: string): Promise<string | undefined> {
  try {
    const fd = await fs.promises.open(filePath, "r");
    const buf = Buffer.alloc(4);
    try {
      const { bytesRead } = await fd.read(buf, 0, 4, 0);
      if (bytesRead < 2) {
        return undefined;
      }
    } finally {
      await fd.close();
    }
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      return "zip";
    }
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      return "tar.gz";
    }
    if (buf[0] === 0x42 && buf[1] === 0x5a) {
      return "tar.bz2";
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function sanitizeSkillName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Inspect the top-level entries of an archive and return the appropriate
 * stripComponents value:
 *  - 1  when there is exactly one top-level directory and ALL content lives
 *       inside it (classic "github-release" wrapping).
 *  - 0  when files already sit at the root (SKILL.md, _meta.json, scripts/).
 */
async function resolveStripComponents(
  archivePath: string,
  archiveType: string,
  timeoutMs: number,
): Promise<number> {
  try {
    let entries: string[] = [];

    if (archiveType === "zip") {
      const buf = await fs.promises.readFile(archivePath);
      const zip = await JSZip.loadAsync(buf);
      entries = Object.keys(zip.files);
    } else {
      // tar.gz or tar.bz2 — use "tar tf"
      const result = await runCommandWithTimeout(["tar", "tf", archivePath], { timeoutMs });
      if (result.code !== 0) {
        return 1; // fall back to strip on failure
      }
      entries = result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    }

    if (entries.length === 0) {
      return 0;
    }

    // Collect distinct top-level path components
    const topLevelNames = new Set<string>();
    for (const entry of entries) {
      const first = entry.split("/")[0];
      if (first) {
        topLevelNames.add(first);
      }
    }

    if (topLevelNames.size !== 1) {
      // Multiple top-level items → already flat, do not strip
      return 0;
    }

    // Exactly one top-level name; check whether there are files sitting
    // directly at that name (i.e. the name itself is a file, not a dir)
    const [onlyName] = [...topLevelNames];
    const hasRootFile = entries.some((e) => e === onlyName || !e.startsWith(onlyName + "/"));
    if (hasRootFile) {
      return 0;
    }

    // All entries are under a single directory wrapper → strip it
    return 1;
  } catch {
    return 1; // safe default
  }
}

function deriveSkillNameFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  let base = path.basename(filename);
  for (const ext of [".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".zip"]) {
    if (lower.endsWith(ext)) {
      base = base.slice(0, base.length - ext.length);
      break;
    }
  }
  return sanitizeSkillName(base) || "skill";
}

async function scanAndWarn(destDir: string, skillName: string): Promise<string[]> {
  const warnings: string[] = [];
  try {
    const summary = await scanDirectoryWithSummary(destDir);
    if (summary.critical > 0) {
      warnings.push(
        `WARNING: Skill "${skillName}" contains dangerous code patterns. Review before use.`,
      );
    } else if (summary.warn > 0) {
      warnings.push(
        `Skill "${skillName}" has ${summary.warn} suspicious code pattern(s). Run "openclaw security audit --deep" for details.`,
      );
    }
  } catch (err) {
    warnings.push(
      `Skill "${skillName}" code safety scan failed (${String(err)}). Run "openclaw security audit --deep" after import.`,
    );
  }
  return warnings;
}

export async function importSkill(params: SkillImportRequest): Promise<SkillImportResult> {
  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 300_000, 1_000), 900_000);
  // Use caller-supplied base dir; fall back to global managed skills dir.
  const skillsBaseDir = params.skillsBaseDir ?? path.join(CONFIG_DIR, "skills");

  // ── Validate basic inputs ────────────────────────────────────────────────
  if (params.kind === "url") {
    if (!params.url?.trim()) {
      return { ok: false, message: "url is required for kind=url" };
    }
    try {
      const parsed = new URL(params.url.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, message: "Only http/https URLs are supported" };
      }
    } catch {
      return { ok: false, message: "Invalid URL" };
    }
  } else {
    if (!params.data?.trim()) {
      return { ok: false, message: "data is required for kind=upload" };
    }
  }

  // ── Staging area (needed before we know archiveType) ─────────────────────
  const stagingDir = path.join(skillsBaseDir, ".openclaw-import-staging");
  // Use a placeholder extension; real type resolved after download/upload.
  const archivePath = path.join(stagingDir, `${randomUUID()}.bin`);

  // These are resolved after we have the actual file + response headers.
  let archiveType: string | undefined;
  let filename = "";

  try {
    await ensureDir(stagingDir);

    // ── Obtain archive file ─────────────────────────────────────────────
    if (params.kind === "url") {
      const headers = await downloadUrlToFile({
        url: params.url!.trim(),
        destPath: archivePath,
        stagingDir,
        timeoutMs,
      });

      // Resolve filename: URL path → Content-Disposition header
      const urlPathname = new URL(params.url!.trim()).pathname;
      const urlBasename = path.basename(urlPathname);
      // Try Content-Disposition filename first
      const cdMatch = headers.contentDisposition
        ? /filename\*?=["']?(?:UTF-8'')?([^"';\s]+)/i.exec(headers.contentDisposition)
        : null;
      const cdFilename = cdMatch?.[1] ? decodeURIComponent(cdMatch[1]) : "";
      filename = cdFilename || urlBasename || "download";

      // Detect archive type: filename → headers → magic bytes
      archiveType =
        detectArchiveTypeFromName(filename) ??
        detectArchiveTypeFromHeaders(headers) ??
        (await detectArchiveTypeFromMagic(archivePath));
    } else {
      // kind=upload: decode base64
      const buf = Buffer.from(params.data!.trim(), "base64");
      await fs.promises.writeFile(archivePath, buf);
      filename = params.filename?.trim() || "upload.bin";
      archiveType =
        detectArchiveTypeFromName(filename) ?? (await detectArchiveTypeFromMagic(archivePath));
    }

    if (!archiveType) {
      return {
        ok: false,
        message: `Could not detect archive type. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
      };
    }

    // ── Resolve destination skill name & directory ────────────────────────
    const rawSkillName = params.skillName?.trim() || deriveSkillNameFromFilename(filename);
    const skillName = sanitizeSkillName(rawSkillName);
    if (!skillName) {
      return { ok: false, message: "Could not determine a valid skill name" };
    }

    const destDir = path.join(skillsBaseDir, skillName);

    await ensureDir(skillsBaseDir);
    try {
      await assertCanonicalPathWithinBase({
        baseDir: skillsBaseDir,
        candidatePath: destDir,
        boundaryLabel: "skills directory",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }

    // ── Extract to destination ──────────────────────────────────────────
    // Remove existing dir if present so we get a clean import
    await fs.promises.rm(destDir, { recursive: true, force: true });
    await ensureDir(destDir);

    // Dynamically decide strip level: 1 if archive has a single wrapper dir,
    // 0 if files already sit at the archive root (SKILL.md, scripts/, etc.).
    const stripComponents = await resolveStripComponents(archivePath, archiveType, timeoutMs);

    const extractResult = await extractArchive({
      archivePath,
      archiveType,
      targetDir: destDir,
      stripComponents,
      timeoutMs,
    });

    if (extractResult.code !== 0) {
      // Clean up partial extraction
      await fs.promises.rm(destDir, { recursive: true, force: true }).catch(() => undefined);
      return {
        ok: false,
        message: extractResult.stderr.trim() || "Extraction failed",
      };
    }

    // ── Security scan ─────────────────────────────────────────────────────
    const warnings = await scanAndWarn(destDir, skillName);

    return {
      ok: true,
      message: `Skill "${skillName}" imported successfully`,
      skillName,
      destDir,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  } finally {
    // Always clean up staging archive
    await fs.promises.rm(archivePath, { force: true }).catch(() => undefined);
    await fs.promises.rmdir(stagingDir).catch(() => undefined);
  }
}
