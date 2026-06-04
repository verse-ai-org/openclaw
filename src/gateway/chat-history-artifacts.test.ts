import { describe, expect, it } from "vitest";
import { CHAT_UPLOADED_FILES_CONTENT_HEADING } from "./chat-attachments.js";
import { buildArtifactId } from "./chat-artifact-id.js";
import { projectChatHistoryMessagesWithArtifacts } from "./chat-history-artifacts.js";

describe("projectChatHistoryMessagesWithArtifacts", () => {
  it("strips appendix and adds artifactRefs from file markers", () => {
    const sessionKey = "agent:main:main";
    const appendix = `\n\n${CHAT_UPLOADED_FILES_CONTENT_HEADING}\n\n[File: report.pdf]`;
    const messages = projectChatHistoryMessagesWithArtifacts(
      [
        {
          role: "user",
          content: `summarize this${appendix}`,
        },
      ],
      sessionKey,
    );
    expect(messages[0]?.content).toBe("summarize this");
    const refs = messages[0]?.artifactRefs as Array<{ artifactId: string }> | undefined;
    expect(refs?.length).toBe(1);
    expect(refs?.[0]?.artifactId).toBe(
      buildArtifactId({
        sessionKey,
        messageSeq: 1,
        contentIndex: 1,
        title: "report.pdf",
        type: "file",
      }),
    );
    expect(messages[0]?.attachments).toEqual([
      { fileName: "report.pdf", mimeType: "application/pdf", size: 0 },
    ]);
  });

  it("indexes assistant image content blocks", () => {
    const messages = projectChatHistoryMessagesWithArtifacts(
      [
        {
          role: "assistant",
          content: [{ type: "image", data: "aGVsbG8=", mimeType: "image/png", alt: "out.png" }],
          __openclaw: { seq: 2 },
        },
      ],
      "agent:main:main",
    );
    const refs = messages[0]?.artifactRefs as Array<{ artifactId: string; role?: string }>;
    expect(refs).toHaveLength(1);
    expect(refs[0]?.role).toBe("output");
  });

  it("strips media attached lines from user display text", () => {
    const messages = projectChatHistoryMessagesWithArtifacts(
      [
        {
          role: "user",
          content:
            "look at this\n[media attached: media://inbound/photo.png (image/png) | media://inbound/photo.png]",
          __openclaw: { seq: 1 },
        },
      ],
      "agent:main:main",
    );
    expect(messages[0]?.content).toBe("look at this");
  });

  it("indexes media attached lines as artifactRefs and attachment hints", () => {
    const mediaLine =
      "[media attached: media://inbound/川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg (image/jpeg) | media://inbound/川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg]";
    const messages = projectChatHistoryMessagesWithArtifacts(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${mediaLine}\n[Thu 2026-06-04 21:16 GMT+8] 查看一下这张图片的尺寸和格式信息`,
            },
          ],
        },
      ],
      "agent:my-office-helper:34a7bb58",
    );
    const user = messages[0] as Record<string, unknown>;
    expect(user.content).toEqual([
      {
        type: "text",
        text: "[Thu 2026-06-04 21:16 GMT+8] 查看一下这张图片的尺寸和格式信息",
      },
    ]);
    const refs = user.artifactRefs as Array<{ artifactId: string }> | undefined;
    expect(refs?.length).toBe(1);
    const attachments = user.attachments as Array<{ mediaRef?: string; mimeType: string }>;
    expect(attachments[0]?.mediaRef).toBe(
      "media://inbound/川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg",
    );
    expect(attachments[0]?.mimeType).toBe("image/jpeg");
  });

  it("indexes user MediaPaths as artifact refs", () => {
    const messages = projectChatHistoryMessagesWithArtifacts(
      [
        {
          role: "user",
          content: "see image",
          MediaPaths: ["/data/inbound/photo.png"],
          MediaTypes: ["image/png"],
          __openclaw: { seq: 1 },
        },
      ],
      "agent:main:main",
    );
    const refs = messages[0]?.artifactRefs as Array<{ artifactId: string }> | undefined;
    expect(refs?.length).toBe(1);
  });
});
