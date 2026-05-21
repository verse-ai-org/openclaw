import { describe, expect, it } from "vitest";
import { getContextNoticeViewModel } from "./context-notice";
import type { SessionEntry } from "@/hooks/session-manager/types";

describe("getContextNoticeViewModel", () => {
  it("returns null when totalTokensFresh is false", () => {
    const session: SessionEntry = {
      key: "main",
      totalTokens: 1000,
      totalTokensFresh: false,
      contextTokens: 200_000,
    };
    expect(getContextNoticeViewModel(session, null)).toBeNull();
  });

  it("renders low-usage detail without warning", () => {
    const session: SessionEntry = {
      key: "main",
      totalTokens: 46_000,
      totalTokensFresh: true,
      contextTokens: 200_000,
    };
    const model = getContextNoticeViewModel(session, null);
    expect(model?.pct).toBe(23);
    expect(model?.detail).toBe("46k / 200k");
    expect(model?.warning).toBe(false);
    expect(model?.compactRecommended).toBe(false);
  });

  it("marks compact recommended at 90%+ context", () => {
    const session: SessionEntry = {
      key: "main",
      totalTokens: 190_000,
      totalTokensFresh: true,
      contextTokens: 200_000,
    };
    const model = getContextNoticeViewModel(session, null);
    expect(model?.pct).toBe(95);
    expect(model?.warning).toBe(true);
    expect(model?.compactRecommended).toBe(true);
  });

  it("uses defaults contextTokens when session limit missing", () => {
    const session: SessionEntry = { key: "main", totalTokens: 21, totalTokensFresh: true };
    const model = getContextNoticeViewModel(session, 1_000_000);
    expect(model?.detail).toBe("21 / 1M");
    expect(model?.pct).toBe(0);
  });
});
