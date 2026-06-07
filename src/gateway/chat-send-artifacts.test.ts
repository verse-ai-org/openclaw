import { describe, expect, it } from "vitest";
import { collectArtifactsFromMessages } from "./server-methods/artifacts.js";
import {
  attachmentRefArtifactContentIndexOffset,
  buildChatSendAckArtifacts,
  buildUserTranscriptContentWithAttachmentRefs,
} from "./chat-send-artifacts.js";

describe("buildChatSendAckArtifacts", () => {
  it("returns image artifacts with bytes download for inline base64", () => {
    const artifacts = buildChatSendAckArtifacts({
      sessionKey: "agent:main:main",
      runId: "run-1",
      attachments: [
        {
          mimeType: "image/png",
          fileName: "photo.png",
          content: "aGVsbG8=",
        },
      ],
      offloadedRefs: [],
      attachmentRefs: [],
    });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      type: "image",
      title: "photo.png",
      mimeType: "image/png",
      source: "user-upload",
      role: "input",
      ingestChannel: "inline-base64",
      download: { mode: "bytes" },
      runId: "run-1",
    });
    expect(artifacts[0]?.id).toMatch(/^artifact_/);
  });

  it("returns offloaded image artifacts with mediaRef and bytes download", () => {
    const artifacts = buildChatSendAckArtifacts({
      sessionKey: "agent:main:main",
      runId: "run-offload",
      attachments: [],
      offloadedRefs: [
        {
          mediaRef: "media://inbound/photo.png",
          id: "photo.png",
          path: "/data/inbound/photo.png",
          mimeType: "image/png",
          label: "photo.png",
          sizeBytes: 42,
        },
      ],
      attachmentRefs: [],
    });
    expect(artifacts[0]).toMatchObject({
      type: "image",
      mediaRef: "media://inbound/photo.png",
      download: { mode: "bytes" },
      ingestChannel: "path-ref",
    });
  });

  it("includes stagingRevealPath when staged copy paths are provided", () => {
    const artifacts = buildChatSendAckArtifacts({
      sessionKey: "agent:main:main",
      runId: "run-staged",
      attachments: [],
      offloadedRefs: [],
      attachmentRefs: [
        {
          fileId: "abc",
          path: "/tmp/doc.pdf",
          fileName: "doc.pdf",
          mimeType: "application/pdf",
          size: 1024,
          sha256: "deadbeef",
        },
      ],
      stagedPathsByFileId: new Map([["abc", "/workspace/attachments/staging/run-staged/abc_doc.pdf"]]),
    });
    expect(artifacts[0]).toMatchObject({
      localRevealPath: "/tmp/doc.pdf",
      stagingRevealPath: "/workspace/attachments/staging/run-staged/abc_doc.pdf",
    });
  });

  it("returns path-ref artifacts as unsupported download", () => {
    const artifacts = buildChatSendAckArtifacts({
      sessionKey: "agent:main:main",
      runId: "run-2",
      attachments: [],
      offloadedRefs: [],
      attachmentRefs: [
        {
          fileId: "abc",
          path: "/tmp/doc.pdf",
          fileName: "doc.pdf",
          mimeType: "application/pdf",
          size: 1024,
          sha256: "deadbeef",
        },
      ],
    });
    expect(artifacts[0]).toMatchObject({
      type: "file",
      title: "doc.pdf",
      ingestChannel: "path-ref",
      localRevealPath: "/tmp/doc.pdf",
      download: { mode: "unsupported" },
    });
  });

  it("builds transcript file blocks with stagingRevealPath when staged", () => {
    const content = buildUserTranscriptContentWithAttachmentRefs(
      "edit this",
      [
        {
          fileId: "abc",
          path: "/secret/doc.pdf",
          fileName: "doc.pdf",
          mimeType: "application/pdf",
          size: 100,
          sha256: "dead",
        },
      ],
      new Map([["abc", "/workspace/staging/doc.pdf"]]),
    );
    expect(content).toEqual([
      { type: "text", text: "edit this" },
      {
        type: "file",
        title: "doc.pdf",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        localRevealPath: "/secret/doc.pdf",
        stagingRevealPath: "/workspace/staging/doc.pdf",
        sizeBytes: 100,
      },
    ]);
  });

  it("builds transcript file blocks with localRevealPath but without path in display text", () => {
    const content = buildUserTranscriptContentWithAttachmentRefs("hello", [
      {
        fileId: "abc",
        path: "/secret/doc.pdf",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        size: 100,
        sha256: "dead",
      },
    ]);
    expect(content).toEqual([
      { type: "text", text: "hello" },
      {
        type: "file",
        title: "doc.pdf",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        localRevealPath: "/secret/doc.pdf",
        sizeBytes: 100,
      },
    ]);
    const textParts = JSON.stringify(content).match(/"text":"[^"]*"/g)?.join("") ?? "";
    expect(textParts).not.toContain("/secret/");
  });

  it("aligns path-ref artifact ids with transcript content indices", () => {
    const offset = attachmentRefArtifactContentIndexOffset("hi");
    expect(offset).toBe(1);
    const artifacts = buildChatSendAckArtifacts({
      sessionKey: "agent:main:main",
      runId: "run-1",
      attachments: [],
      offloadedRefs: [],
      attachmentRefs: [
        {
          fileId: "abc",
          path: "/tmp/doc.pdf",
          fileName: "doc.pdf",
          mimeType: "application/pdf",
          size: 1,
          sha256: "x",
        },
      ],
      attachmentRefContentIndexOffset: offset,
      messageSeq: 3,
    });
    const listed = collectArtifactsFromMessages({
      sessionKey: "agent:main:main",
      messages: [
        {
          role: "user",
          content: buildUserTranscriptContentWithAttachmentRefs("hi", [
            {
              fileId: "abc",
              path: "/tmp/doc.pdf",
              fileName: "doc.pdf",
              mimeType: "application/pdf",
              size: 1,
              sha256: "x",
            },
          ]),
          __openclaw: { seq: 3 },
        },
      ],
    });
    expect(artifacts[0]?.id).toBe(listed[0]?.id);
  });
});
