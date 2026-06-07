import { describe, expect, it, vi } from "vitest";
import { saveStagingCopyAs } from "./artifact-staging-actions";

vi.mock("@/utils/electron-env", () => ({
  getElectronBridge: () => ({
    saveStagingCopyAs: vi.fn(async () => ({
      ok: true,
      savedPath: "/Users/me/Desktop/report-edited.pdf",
    })),
  }),
}));

describe("artifact-staging-actions", () => {
  it("saveStagingCopyAs forwards to electron bridge", async () => {
    const result = await saveStagingCopyAs({
      stagingPath: "/workspace/attachments/staging/run-1/file.pdf",
      defaultName: "report.pdf",
    });
    expect(result).toEqual({
      ok: true,
      savedPath: "/Users/me/Desktop/report-edited.pdf",
    });
  });
});
