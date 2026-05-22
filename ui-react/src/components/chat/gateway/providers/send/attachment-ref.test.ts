import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import type { ElectronBridgeEnv } from "@/utils/electron-env";

const getElectronBridgeMock = vi.fn<() => ElectronBridgeEnv | undefined>();

vi.mock("@/utils/electron-env", () => ({
  getElectronBridge: () => getElectronBridgeMock(),
}));

import { buildAttachmentRefsFromMessage } from "./attachment-ref";

function makeMessage(file: File, name: string): AppendMessage {
  return {
    content: [{ type: "text", text: "hello" }],
    attachments: [
      {
        status: { type: "complete" },
        name,
        contentType: file.type,
        file,
        content: [
          {
            type: "file",
            data: "",
            mimeType: file.type,
            filename: name,
          },
        ],
      },
    ],
  } as unknown as AppendMessage;
}

describe("buildAttachmentRefsFromMessage", () => {
  beforeEach(() => {
    getElectronBridgeMock.mockReset();
  });

  afterEach(() => {
    getElectronBridgeMock.mockReset();
  });

  it("resolves path via electronBridge.getPathForFile", async () => {
    const file = new File(["a,b\n1,2"], "test.csv", { type: "text/csv" });
    getElectronBridgeMock.mockReturnValue({
      getPathForFile: () => "/tmp/test.csv",
    });

    const { refs, missingPathFiles } = await buildAttachmentRefsFromMessage(makeMessage(file, "test.csv"));

    expect(missingPathFiles).toEqual([]);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.path).toBe("/tmp/test.csv");
    expect(refs[0]?.fileName).toBe("test.csv");
    expect(refs[0]?.mimeType).toBe("text/csv");
    expect(refs[0]?.fileId).toMatch(/^[a-f0-9]{24}$/);
    expect(refs[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("falls back to legacy File.path when bridge is unavailable", async () => {
    const file = new File(["hello"], "doc.txt", { type: "text/plain" });
    Object.defineProperty(file, "path", { value: "/legacy/doc.txt" });
    getElectronBridgeMock.mockReturnValue(undefined);

    const { refs, missingPathFiles } = await buildAttachmentRefsFromMessage(makeMessage(file, "doc.txt"));

    expect(missingPathFiles).toEqual([]);
    expect(refs[0]?.path).toBe("/legacy/doc.txt");
  });

  it("reports missing paths when neither bridge nor File.path is available", async () => {
    const file = new File(["hello"], "test.csv", { type: "text/csv" });
    getElectronBridgeMock.mockReturnValue(undefined);

    const { refs, missingPathFiles } = await buildAttachmentRefsFromMessage(makeMessage(file, "test.csv"));

    expect(refs).toEqual([]);
    expect(missingPathFiles).toEqual(["test.csv"]);
  });
});
