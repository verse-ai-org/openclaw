import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const downloadClawHubSkillArchiveMock = vi.fn();
const archiveCleanupMock = vi.fn();

vi.mock("../infra/clawhub.js", () => ({
  downloadClawHubSkillArchive: downloadClawHubSkillArchiveMock,
}));

const { importSkill, parseClawHubSlugFromImportUrl } = await import("./skills-import.js");

describe("parseClawHubSlugFromImportUrl", () => {
  it("parses ClawHub skill page URLs", () => {
    expect(parseClawHubSlugFromImportUrl("https://clawhub.ai/steipete/notion")).toBe("notion");
    expect(parseClawHubSlugFromImportUrl("https://clawhub.ai/steipete/notion/")).toBe("notion");
  });

  it("parses ClawHub download API URLs", () => {
    expect(parseClawHubSlugFromImportUrl("https://clawhub.ai/api/v1/download?slug=obsidian")).toBe(
      "obsidian",
    );
  });

  it("parses legacy Convex download URLs", () => {
    expect(
      parseClawHubSlugFromImportUrl(
        "https://wry-manatee-359.convex.site/api/v1/download?slug=obsidian",
      ),
    ).toBe("obsidian");
  });

  it("returns null for unrelated hosts", () => {
    expect(parseClawHubSlugFromImportUrl("https://example.com/foo/bar")).toBeNull();
  });
});

describe("importSkill ClawHub URL path", () => {
  let tempRoot = "";

  afterEach(async () => {
    downloadClawHubSkillArchiveMock.mockReset();
    archiveCleanupMock.mockReset();
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
      tempRoot = "";
    }
  });

  it("imports into managed dir via downloadClawHubSkillArchive without guarded URL fetch", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-import-clawhub-"));
    const skillsBaseDir = path.join(tempRoot, "skills");
    const archivePath = path.join(tempRoot, "notion.zip");

    await fs.writeFile(archivePath, Buffer.from("PK\x05\x06", "utf8"));

    archiveCleanupMock.mockResolvedValue(undefined);
    downloadClawHubSkillArchiveMock.mockResolvedValue({
      archivePath,
      cleanup: archiveCleanupMock,
    });

    const result = await importSkill({
      kind: "url",
      url: "https://clawhub.ai/steipete/notion",
      skillsBaseDir,
      timeoutMs: 5_000,
    });

    expect(downloadClawHubSkillArchiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "notion" }),
    );
    expect(result.ok).toBe(false);
    expect(archiveCleanupMock).toHaveBeenCalled();
    expect(result.message).not.toMatch(/Blocked:/i);
  });
});
