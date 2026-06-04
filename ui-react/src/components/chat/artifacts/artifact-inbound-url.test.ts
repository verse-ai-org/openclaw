import { describe, expect, it } from "vitest";
import { buildAssistantMediaUrl } from "./artifact-inbound-url";

describe("buildAssistantMediaUrl", () => {
  it("maps ws gateway URL to assistant-media http URL", () => {
    const url = buildAssistantMediaUrl({
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "secret",
      mediaRef: "media://inbound/photo.png",
    });
    expect(url).toBe(
      "http://127.0.0.1:18789/__openclaw__/assistant-media?source=media%3A%2F%2Finbound%2Fphoto.png&token=secret",
    );
  });
});
