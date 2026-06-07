import { getElectronBridge } from "@/utils/electron-env";

export type StagingActionResult = { ok: true } | { ok: false; error?: string };

export async function revealLocalPath(absolutePath: string): Promise<StagingActionResult> {
  const showItemInFolder = getElectronBridge()?.showItemInFolder;
  if (!showItemInFolder) {
    return { ok: false, error: "not-electron" };
  }
  try {
    const result = await showItemInFolder(absolutePath);
    return result.ok ? { ok: true } : { ok: false, error: "not-found" };
  } catch {
    return { ok: false, error: "reveal-failed" };
  }
}

export async function replaceOriginalWithStagingCopy(params: {
  stagingPath: string;
  originalPath: string;
  fileName: string;
}): Promise<StagingActionResult> {
  const confirmed = window.confirm(
    `Replace the original file "${params.fileName}" with the edited workspace copy? This cannot be undone.`,
  );
  if (!confirmed) {
    return { ok: false, error: "cancelled" };
  }
  const copyStagingToPath = getElectronBridge()?.copyStagingToPath;
  if (!copyStagingToPath) {
    return { ok: false, error: "not-electron" };
  }
  return copyStagingToPath({
    source: params.stagingPath,
    dest: params.originalPath,
  });
}

export async function saveStagingCopyAs(params: {
  stagingPath: string;
  defaultName: string;
}): Promise<StagingActionResult & { savedPath?: string }> {
  const saveStagingCopyAs = getElectronBridge()?.saveStagingCopyAs;
  if (!saveStagingCopyAs) {
    return { ok: false, error: "not-electron" };
  }
  const result = await saveStagingCopyAs({
    source: params.stagingPath,
    defaultName: params.defaultName,
  });
  if (result.ok) {
    return { ok: true, savedPath: result.savedPath };
  }
  return { ok: false, error: result.error };
}

export async function discardStagingCopy(stagingPath: string): Promise<StagingActionResult> {
  const confirmed = window.confirm(
    "Discard the workspace copy? The original file will not be changed.",
  );
  if (!confirmed) {
    return { ok: false, error: "cancelled" };
  }
  const deleteStagingPath = getElectronBridge()?.deleteStagingPath;
  if (!deleteStagingPath) {
    return { ok: false, error: "not-electron" };
  }
  return deleteStagingPath(stagingPath);
}
