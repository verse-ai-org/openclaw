import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAttachmentRoutingHint,
  buildStagedPathMaps,
  classifyAttachmentIntent,
  formatAttachmentRefsForAgent,
  shouldStagePathRefForIntent,
  stageAttachmentRefsForEditIntent,
} from "./attachment-ref-agent.js";
import type { ChatAttachmentRef } from "./server-methods/attachment-normalize.js";

describe("classifyAttachmentIntent", () => {
  it("detects edit-convert keywords", () => {
    expect(classifyAttachmentIntent("please convert this to pdf")).toBe("edit-convert");
  });

  it("detects read-extract keywords", () => {
    expect(classifyAttachmentIntent("summarize this document")).toBe("read-extract");
  });
});

describe("formatAttachmentRefsForAgent", () => {
  const ref: ChatAttachmentRef = {
    fileId: "f1",
    path: "/tmp/report.pdf",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    size: 100,
    sha256: "abc",
  };

  it("formats direct path refs", () => {
    const prompt = formatAttachmentRefsForAgent({ refs: [ref] });
    expect(prompt).toContain("Uploaded File References:");
    expect(prompt).toContain("path=/tmp/report.pdf");
    expect(prompt).not.toContain("sourcePath=");
  });

  it("formats staged refs with source paths", () => {
    const stagedRef = { ...ref, path: "/workspace/staging/f1_report.pdf" };
    const prompt = formatAttachmentRefsForAgent({
      refs: [stagedRef],
      stagedSourcePathsByFileId: new Map([["f1", "/tmp/report.pdf"]]),
    });
    expect(prompt).toContain("staged copies where noted");
    expect(prompt).toContain("path=/workspace/staging/f1_report.pdf");
    expect(prompt).toContain("sourcePath=/tmp/report.pdf");
    expect(prompt).toContain("Do not modify the user's original files");
  });
});

describe("shouldStagePathRefForIntent", () => {
  const pdfRef: ChatAttachmentRef = {
    fileId: "f1",
    path: "/tmp/a.pdf",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    size: 1,
    sha256: "x",
  };

  it("stages edit-convert for any mime", () => {
    expect(
      shouldStagePathRefForIntent({
        ref: { ...pdfRef, mimeType: "application/msword" },
        intent: "edit-convert",
      }),
    ).toBe(true);
  });

  it("does not stage read-extract", () => {
    expect(shouldStagePathRefForIntent({ ref: pdfRef, intent: "read-extract" })).toBe(false);
  });

  it("stages PDF on unknown intent", () => {
    expect(shouldStagePathRefForIntent({ ref: pdfRef, intent: "unknown" })).toBe(true);
  });
});

describe("buildStagedPathMaps", () => {
  it("maps only refs whose agent path differs from original", () => {
    const original: ChatAttachmentRef = {
      fileId: "f1",
      path: "/tmp/a.pdf",
      fileName: "a.pdf",
      mimeType: "application/pdf",
      size: 1,
      sha256: "x",
    };
    const agent: ChatAttachmentRef = {
      ...original,
      path: "/workspace/staging/a.pdf",
    };
    const maps = buildStagedPathMaps({ originalRefs: [original], agentRefs: [agent] });
    expect(maps.stagingRevealPathsByFileId.get("f1")).toBe("/workspace/staging/a.pdf");
    expect(maps.stagedSourcePathsByFileId.get("f1")).toBe("/tmp/a.pdf");
  });
});

describe("buildAttachmentRoutingHint", () => {
  const ref: ChatAttachmentRef = {
    fileId: "f1",
    path: "/tmp/a.pdf",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    size: 1,
    sha256: "x",
  };

  it("uses staged routing copy when staged", () => {
    const hint = buildAttachmentRoutingHint({
      refs: [ref],
      userText: "edit this file",
      staged: true,
    });
    expect(hint).toContain("staged copy paths");
    expect(hint).not.toContain("directly");
  });
});

describe("stageAttachmentRefsForEditIntent", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("copies path-ref files into workspace staging for edit-convert", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-staging-"));
    tempDirs.push(tempRoot);
    const sourcePath = path.join(tempRoot, "original.pdf");
    await fs.writeFile(sourcePath, "%PDF-stub");

    const ref: ChatAttachmentRef = {
      fileId: "file123",
      path: sourcePath,
      fileName: "original.pdf",
      mimeType: "application/pdf",
      size: 9,
      sha256: "deadbeef",
    };

    const result = await stageAttachmentRefsForEditIntent({
      refs: [ref],
      userText: "please edit this pdf",
      cfg: { agents: { defaults: { workspace: tempRoot } } },
      agentId: "main",
      runId: "run-1",
    });

    expect(result.staged).toBe(true);
    expect(result.refs[0]?.path).not.toBe(sourcePath);
    expect(result.refs[0]?.path).toContain(path.join("attachments", "staging", "run-1"));
    const stagedBytes = await fs.readFile(result.refs[0]!.path);
    expect(stagedBytes.toString()).toBe("%PDF-stub");
  });

  it("stages PDF path-ref on unknown intent without edit keywords", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-staging-"));
    tempDirs.push(tempRoot);
    const sourcePath = path.join(tempRoot, "report.pdf");
    await fs.writeFile(sourcePath, "%PDF");

    const ref: ChatAttachmentRef = {
      fileId: "pdf1",
      path: sourcePath,
      fileName: "report.pdf",
      mimeType: "application/pdf",
      size: 4,
      sha256: "abc",
    };

    const result = await stageAttachmentRefsForEditIntent({
      refs: [ref],
      userText: "what is in this file",
      cfg: { agents: { defaults: { workspace: tempRoot } } },
      agentId: "main",
      runId: "run-unknown",
    });

    expect(result.staged).toBe(true);
    expect(result.refs[0]?.path).not.toBe(sourcePath);
  });

  it("skips staging for read-extract intent", async () => {
    const ref: ChatAttachmentRef = {
      fileId: "f1",
      path: "/tmp/a.pdf",
      fileName: "a.pdf",
      mimeType: "application/pdf",
      size: 1,
      sha256: "x",
    };
    const result = await stageAttachmentRefsForEditIntent({
      refs: [ref],
      userText: "summarize this",
      cfg: {} as never,
      agentId: "main",
      runId: "run-1",
    });
    expect(result).toEqual({ refs: [ref], staged: false });
  });
});
