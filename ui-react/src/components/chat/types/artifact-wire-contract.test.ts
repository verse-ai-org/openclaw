import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeArtifactSummaries,
  normalizeHistoryArtifactRefs,
} from "@/components/chat/adapters/gateway/message-normalize";

const PROTOCOL_SCHEMA_PATH = resolve(process.cwd(), "dist/protocol.schema.json");

const GATEWAY_ARTIFACT_SUMMARY_FIELDS = [
  "id",
  "type",
  "title",
  "mimeType",
  "sizeBytes",
  "sessionKey",
  "runId",
  "taskId",
  "messageSeq",
  "contentIndex",
  "source",
  "role",
  "ingestChannel",
  "mediaRef",
  "download",
] as const;

const GATEWAY_ARTIFACT_REF_FIELDS = ["artifactId", "role"] as const;

describe("artifact wire contract", () => {
  it("keeps ui-react artifact normalizers aligned with gateway schema fields", () => {
    const refs = normalizeHistoryArtifactRefs([{ artifactId: "artifact_x", role: "input" }]);
    expect(refs?.[0] && Object.keys(refs[0]).toSorted()).toEqual([...GATEWAY_ARTIFACT_REF_FIELDS].toSorted());

    const summaries = normalizeArtifactSummaries([
      {
        id: "artifact_x",
        type: "file",
        title: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        sessionKey: "agent:main:main",
        runId: "run-1",
        taskId: "task-1",
        messageSeq: 2,
        contentIndex: 0,
        source: "user-upload",
        role: "input",
        ingestChannel: "path-ref",
        mediaRef: "media://inbound/report.pdf",
        download: { mode: "bytes" },
      },
    ]);
    const keys = Object.keys(summaries?.[0] ?? {}).toSorted();
    for (const field of GATEWAY_ARTIFACT_SUMMARY_FIELDS) {
      expect(keys).toContain(field);
    }
  });

  it("matches generated protocol schema definitions when dist is present", () => {
    if (!existsSync(PROTOCOL_SCHEMA_PATH)) {
      return;
    }
    const schema = JSON.parse(readFileSync(PROTOCOL_SCHEMA_PATH, "utf8")) as {
      definitions?: Record<string, { properties?: Record<string, unknown> }>;
    };
    const summaryProps = Object.keys(schema.definitions?.ArtifactSummary?.properties ?? {}).toSorted();
    const refProps = Object.keys(schema.definitions?.ArtifactRef?.properties ?? {}).toSorted();
    expect(summaryProps).toEqual([...GATEWAY_ARTIFACT_SUMMARY_FIELDS].toSorted());
    expect(refProps).toEqual([...GATEWAY_ARTIFACT_REF_FIELDS].toSorted());
  });
});
