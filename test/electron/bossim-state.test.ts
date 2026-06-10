import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveBossimStateDir,
  isUsingOpenclawState,
} from "../../apps/electron/src/main/bossim-state.js";

const HOME = "/home/test";
const home = () => HOME;

describe("resolveBossimStateDir", () => {
  it("defaults to ~/.bossim", () => {
    expect(resolveBossimStateDir({} as NodeJS.ProcessEnv, home)).toBe(
      path.join(HOME, ".bossim"),
    );
  });

  it("respects BOSSIM_STATE_DIR absolute override", () => {
    const env = { BOSSIM_STATE_DIR: "/custom/path" } as NodeJS.ProcessEnv;
    expect(resolveBossimStateDir(env, home)).toBe("/custom/path");
  });

  it("resolves BOSSIM_STATE_DIR relative override against cwd", () => {
    const env = { BOSSIM_STATE_DIR: "./rel" } as NodeJS.ProcessEnv;
    expect(resolveBossimStateDir(env, home)).toBe(path.resolve("./rel"));
  });

  it("routes to ~/.openclaw when BOSSIM_USE_OPENCLAW_STATE=1 (escape hatch)", () => {
    const env = { BOSSIM_USE_OPENCLAW_STATE: "1" } as NodeJS.ProcessEnv;
    expect(resolveBossimStateDir(env, home)).toBe(path.join(HOME, ".openclaw"));
  });

  it("escape hatch wins over BOSSIM_STATE_DIR", () => {
    const env = {
      BOSSIM_USE_OPENCLAW_STATE: "1",
      BOSSIM_STATE_DIR: "/should/not/win",
    } as NodeJS.ProcessEnv;
    expect(resolveBossimStateDir(env, home)).toBe(path.join(HOME, ".openclaw"));
  });

  it("ignores empty BOSSIM_STATE_DIR", () => {
    const env = { BOSSIM_STATE_DIR: "   " } as NodeJS.ProcessEnv;
    expect(resolveBossimStateDir(env, home)).toBe(path.join(HOME, ".bossim"));
  });
});

describe("isUsingOpenclawState", () => {
  it("only returns true for the literal '1'", () => {
    expect(isUsingOpenclawState({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isUsingOpenclawState({ BOSSIM_USE_OPENCLAW_STATE: "0" } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isUsingOpenclawState({ BOSSIM_USE_OPENCLAW_STATE: "" } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isUsingOpenclawState({ BOSSIM_USE_OPENCLAW_STATE: "1" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
