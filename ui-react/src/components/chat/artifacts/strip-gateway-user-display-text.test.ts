import { describe, expect, it } from "vitest";
import { stripGatewayUserDisplayText } from "./strip-gateway-user-display-text";

describe("stripGatewayUserDisplayText", () => {
  it("removes injectTimestamp prefix from user prompt", () => {
    expect(
      stripGatewayUserDisplayText(
        "[Thu 2026-06-04 21:57 GMT+8] 分析一下这张图片的尺寸和格式信息",
      ),
    ).toBe("分析一下这张图片的尺寸和格式信息");
  });

  it("removes media attached lines and timestamp together", () => {
    expect(
      stripGatewayUserDisplayText(
        "[media attached: media://inbound/photo.png (image/png)]\n[Thu 2026-06-04 21:57 GMT+8] 分析一下这张图片",
      ),
    ).toBe("分析一下这张图片");
  });
});
