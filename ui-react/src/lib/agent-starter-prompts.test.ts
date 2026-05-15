import { describe, expect, it } from "vitest";
import {
  getAgentWelcomeConfig,
  parseAgentIdFromSessionKey,
} from "./agent-starter-prompts";

describe("parseAgentIdFromSessionKey", () => {
  it("parses agent-scoped session keys", () => {
    expect(parseAgentIdFromSessionKey("agent:travel-planner:main")).toBe(
      "travel-planner",
    );
    expect(parseAgentIdFromSessionKey("  agent:my-office-helper:side  ")).toBe(
      "my-office-helper",
    );
  });

  it("maps legacy main to default agent id", () => {
    expect(parseAgentIdFromSessionKey("main")).toBe("main");
    expect(parseAgentIdFromSessionKey("", "main")).toBe("main");
    expect(parseAgentIdFromSessionKey("main", "custom-default")).toBe(
      "custom-default",
    );
  });
});

describe("getAgentWelcomeConfig", () => {
  it("returns config for built-in agents", () => {
    expect(getAgentWelcomeConfig("main")?.prompts).toHaveLength(4);
    expect(getAgentWelcomeConfig("travel-planner")?.headline).toContain("哪儿");
    expect(getAgentWelcomeConfig("my-office-helper")?.headline).toContain("文档");
  });

  it("returns null for unknown agents", () => {
    expect(getAgentWelcomeConfig("user-custom-agent")).toBeNull();
  });
});
