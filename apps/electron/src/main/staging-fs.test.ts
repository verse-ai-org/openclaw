import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyStagingFileToPath,
  deleteStagingFile,
  isAttachmentsStagingPath,
} from "./staging-fs.js";

describe("staging-fs", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("detects workspace staging paths", () => {
    expect(isAttachmentsStagingPath("/home/me/workspace/attachments/staging/run-1/file.pdf")).toBe(
      true,
    );
    expect(isAttachmentsStagingPath("/tmp/file.pdf")).toBe(false);
  });

  it("copies staging files only from staging directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-staging-fs-"));
    tempDirs.push(tempRoot);
    const stagingPath = path.join(tempRoot, "attachments", "staging", "run-1", "copy.pdf");
    await fs.mkdir(path.dirname(stagingPath), { recursive: true });
    await fs.writeFile(stagingPath, "edited");
    const destPath = path.join(tempRoot, "original.pdf");

    const blocked = await copyStagingFileToPath({ source: destPath, dest: stagingPath });
    expect(blocked.ok).toBe(false);

    const copied = await copyStagingFileToPath({ source: stagingPath, dest: destPath });
    expect(copied.ok).toBe(true);
    expect(await fs.readFile(destPath, "utf8")).toBe("edited");
  });

  it("deletes staging files only under staging directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-staging-fs-"));
    tempDirs.push(tempRoot);
    const stagingPath = path.join(tempRoot, "attachments", "staging", "run-1", "copy.pdf");
    await fs.mkdir(path.dirname(stagingPath), { recursive: true });
    await fs.writeFile(stagingPath, "edited");

    const deleted = await deleteStagingFile(stagingPath);
    expect(deleted.ok).toBe(true);
    await expect(fs.stat(stagingPath)).rejects.toThrow();
  });
});
