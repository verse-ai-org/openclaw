import fs from "node:fs/promises";
import path from "node:path";

export function isAttachmentsStagingPath(filePath: string): boolean {
  const normalized = path.normalize(filePath.trim());
  return normalized.includes(`${path.sep}attachments${path.sep}staging${path.sep}`);
}

function isSafeAbsolutePath(filePath: string): boolean {
  const trimmed = filePath.trim();
  return trimmed.length > 0 && path.isAbsolute(trimmed);
}

export async function copyStagingFileToPath(params: {
  source: string;
  dest: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSafeAbsolutePath(params.source) || !isSafeAbsolutePath(params.dest)) {
    return { ok: false, error: "paths must be absolute" };
  }
  if (!isAttachmentsStagingPath(params.source)) {
    return { ok: false, error: "source must be a workspace staging copy" };
  }
  try {
    await fs.copyFile(params.source, params.dest);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteStagingFile(filePath: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSafeAbsolutePath(filePath) || !isAttachmentsStagingPath(filePath)) {
    return { ok: false, error: "not a staging path" };
  }
  try {
    await fs.unlink(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
