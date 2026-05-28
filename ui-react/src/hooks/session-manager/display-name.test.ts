import { describe, expect, it } from "vitest";
import { resolveSessionDisplayName } from "./display-name";
import type { SessionEntry } from "./types";

describe("resolveSessionDisplayName", () => {
  it("prefers derivedTitle over channel routing displayName", () => {
    const session: SessionEntry = {
      key: "agent:main:feishu:group:oc_group",
      displayName: "feishu:g-ocdd2cc5098d",
      derivedTitle: "查询一下成都明天的天气",
    };
    expect(resolveSessionDisplayName(session)).toBe("查询一下成都明天的天气");
  });

  it("prefers user label over derivedTitle", () => {
    const session: SessionEntry = {
      key: "agent:main:main",
      label: "My label",
      derivedTitle: "ignored",
    };
    expect(resolveSessionDisplayName(session)).toBe("My label");
  });

  it("falls back to displayName when derivedTitle is missing", () => {
    const session: SessionEntry = {
      key: "agent:main:feishu:group:oc_group",
      displayName: "feishu:g-ocdd2cc5098d",
    };
    expect(resolveSessionDisplayName(session)).toBe("feishu:g-ocdd2cc5098d");
  });

  it("cleans feishu message_id and speaker prefix from derivedTitle", () => {
    const session: SessionEntry = {
      key: "agent:main:feishu:group:oc_group",
      derivedTitle:
        "[message_id: omx100b6abc]\nou_19d0fb54c65d8261cefc8c1c4e3ad91f: 告诉我明天上海的天气",
    };
    expect(resolveSessionDisplayName(session)).toBe("告诉我明天上海的天气");
  });
});
