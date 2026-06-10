import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runMigration,
  __test,
} from "../../apps/electron/src/main/state-migration.js";

const { MARKER_FILE } = __test;

function withTempHome(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bossim-migrate-"));
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

function writeFile(p: string, contents: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents, "utf8");
}

describe("runMigration", () => {
  let tmp: { root: string; cleanup: () => void };
  let source: string;
  let target: string;

  beforeEach(() => {
    tmp = withTempHome();
    source = path.join(tmp.root, ".openclaw");
    target = path.join(tmp.root, ".bossim");
    fs.mkdirSync(source, { recursive: true });
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("copies whitelist files + directories and writes marker", () => {
    writeFile(
      path.join(source, "openclaw.json"),
      JSON.stringify({
        gateway: { port: 18789 },
        agents: { defaults: { workspace: "~/.openclaw/workspace" } },
      }),
    );
    writeFile(path.join(source, "openclaw.json.last-good"), "{}");
    writeFile(path.join(source, "openclaw.json.bak.1"), "{}");
    writeFile(path.join(source, "gateway-instance-id"), "abc");
    writeFile(
      path.join(source, "agents", "main", "agent", "auth-profiles.json"),
      "{}",
    );
    writeFile(path.join(source, "credentials", "oauth.json"), "{}");
    writeFile(path.join(source, "workspace", "AGENTS.md"), "x");
    writeFile(path.join(source, "skills", "obsidian", "SKILL.md"), "x");
    writeFile(path.join(source, "plugins", "installs.json"), "{}");

    const result = runMigration({ source, target });

    expect(result.status).toBe("migrated");
    expect(result.copiedEntries ?? 0).toBeGreaterThan(0);

    expect(fs.existsSync(path.join(target, "openclaw.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "openclaw.json.last-good"))).toBe(true);
    expect(fs.existsSync(path.join(target, "openclaw.json.bak.1"))).toBe(true);
    expect(fs.existsSync(path.join(target, "gateway-instance-id"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(target, "agents", "main", "agent", "auth-profiles.json"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(target, "credentials", "oauth.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "workspace", "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "skills", "obsidian", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "plugins", "installs.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, MARKER_FILE))).toBe(true);
  });

  it("skips non-whitelisted directories (logs, media, npm cache)", () => {
    writeFile(path.join(source, "openclaw.json"), "{}");
    writeFile(path.join(source, "logs", "electron-main.log"), "noise");
    writeFile(path.join(source, "media", "blob.bin"), "noise");
    writeFile(path.join(source, "npm", "x.tgz"), "noise");
    writeFile(path.join(source, "canvas", "scratch"), "noise");
    writeFile(path.join(source, "plugins", "cache", "huge.bin"), "noise");

    runMigration({ source, target });

    expect(fs.existsSync(path.join(target, "logs"))).toBe(false);
    expect(fs.existsSync(path.join(target, "media"))).toBe(false);
    expect(fs.existsSync(path.join(target, "npm"))).toBe(false);
    expect(fs.existsSync(path.join(target, "canvas"))).toBe(false);
    expect(fs.existsSync(path.join(target, "plugins", "cache"))).toBe(false);
  });

  it("rewrites gateway.port + workspace + drops allowedOrigins", () => {
    const before = {
      gateway: {
        port: 18789,
        controlUi: { allowedOrigins: ["http://127.0.0.1:55444"] },
      },
      agents: { defaults: { workspace: "~/.openclaw/workspace" } },
    };
    writeFile(path.join(source, "openclaw.json"), JSON.stringify(before));

    runMigration({ source, target });

    const after = JSON.parse(
      fs.readFileSync(path.join(target, "openclaw.json"), "utf8"),
    ) as Record<string, unknown>;
    expect((after.gateway as { port: number }).port).toBe(18790);
    expect((after.gateway as { controlUi?: unknown }).controlUi).toBeUndefined();
    expect(
      ((after.agents as { defaults: { workspace: string } }).defaults).workspace,
    ).toBe("~/.bossim/workspace");
  });

  it("leaves non-default gateway.port alone", () => {
    writeFile(
      path.join(source, "openclaw.json"),
      JSON.stringify({ gateway: { port: 19999 } }),
    );
    runMigration({ source, target });
    const after = JSON.parse(
      fs.readFileSync(path.join(target, "openclaw.json"), "utf8"),
    ) as Record<string, unknown>;
    expect((after.gateway as { port: number }).port).toBe(19999);
  });

  it("does not touch the source directory", () => {
    writeFile(path.join(source, "openclaw.json"), "{}");
    writeFile(path.join(source, "workspace", "x"), "data");

    runMigration({ source, target });

    expect(fs.existsSync(path.join(source, "openclaw.json"))).toBe(true);
    expect(fs.existsSync(path.join(source, "workspace", "x"))).toBe(true);
  });
});
