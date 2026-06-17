import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  maybeMigrateLegacyAuthStore,
  resolveAuthStorePath,
  __test,
} from "../../apps/electron/src/main/bossim-auth.js";

const HOME = "/home/test";
const home = () => HOME;

function withTempHome(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bossim-auth-"));
  return {
    root,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

describe("resolveAuthStorePath", () => {
  it("defaults to ~/.bossim/bossim-auth.json", () => {
    expect(resolveAuthStorePath({} as NodeJS.ProcessEnv, home)).toBe(
      path.join(HOME, ".bossim", "bossim-auth.json"),
    );
  });

  it("respects BOSSIM_STATE_DIR override", () => {
    const env = { BOSSIM_STATE_DIR: "/custom/bossim" } as NodeJS.ProcessEnv;
    expect(resolveAuthStorePath(env, home)).toBe(
      path.join("/custom/bossim", "bossim-auth.json"),
    );
  });

  it("uses ~/.openclaw when BOSSIM_USE_OPENCLAW_STATE=1", () => {
    const env = { BOSSIM_USE_OPENCLAW_STATE: "1" } as NodeJS.ProcessEnv;
    expect(resolveAuthStorePath(env, home)).toBe(
      path.join(HOME, ".openclaw", "bossim-auth.json"),
    );
  });

  it("prefers OPENCLAW_CONFIG_DIR over state dir", () => {
    const env = {
      OPENCLAW_CONFIG_DIR: "/cfg",
      BOSSIM_STATE_DIR: "/ignored",
    } as NodeJS.ProcessEnv;
    expect(resolveAuthStorePath(env, home)).toBe(path.join("/cfg", "bossim-auth.json"));
  });
});

describe("maybeMigrateLegacyAuthStore", () => {
  let tmp: { root: string; cleanup: () => void };

  beforeEach(() => {
    tmp = withTempHome();
    __test.resetLegacyAuthMigration();
  });

  afterEach(() => {
    tmp.cleanup();
    __test.resetLegacyAuthMigration();
  });

  it("copies legacy auth file when target is missing", () => {
    const legacyDir = path.join(tmp.root, ".openclaw");
    const targetDir = path.join(tmp.root, ".bossim");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "bossim-auth.json"), '{"plain":{}}', "utf8");

    const homedir = () => tmp.root;
    const env = {} as NodeJS.ProcessEnv;

    maybeMigrateLegacyAuthStore(homedir, env);

    const target = path.join(targetDir, "bossim-auth.json");
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe('{"plain":{}}');
  });

  it("is idempotent when target already exists", () => {
    const legacyDir = path.join(tmp.root, ".openclaw");
    const targetDir = path.join(tmp.root, ".bossim");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "bossim-auth.json"), "legacy", "utf8");
    fs.writeFileSync(path.join(targetDir, "bossim-auth.json"), "current", "utf8");

    const homedir = () => tmp.root;
    maybeMigrateLegacyAuthStore(homedir, {} as NodeJS.ProcessEnv);

    expect(fs.readFileSync(path.join(targetDir, "bossim-auth.json"), "utf8")).toBe("current");
  });

  it("skips migration when BOSSIM_USE_OPENCLAW_STATE=1", () => {
    const legacyDir = path.join(tmp.root, ".openclaw");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "bossim-auth.json"), "legacy", "utf8");

    const homedir = () => tmp.root;
    const env = { BOSSIM_USE_OPENCLAW_STATE: "1" } as NodeJS.ProcessEnv;
    maybeMigrateLegacyAuthStore(homedir, env);

    expect(fs.existsSync(path.join(tmp.root, ".bossim", "bossim-auth.json"))).toBe(false);
  });
});
