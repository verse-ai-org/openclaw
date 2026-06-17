/**
 * Load apps/electron/.env into process.env before auth URLs are read (dev only).
 * Only sets keys that are not already defined in the environment.
 *
 * Never runs in packaged apps — electron-builder can accidentally include .env in
 * app.asar; loading it would override production Bossim auth URLs with localhost.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

function resolveEnvPath(): string | null {
  const candidates = [
    path.join(__dirname, "../../.env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "apps/electron/.env"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && !candidate.includes("app.asar")) {
      return candidate;
    }
  }
  return null;
}

function loadDevEnvFile(): void {
  if (app.isPackaged) {
    return;
  }

  const envPath = resolveEnvPath();
  if (!envPath) {
    console.warn("[load-dev-env] no .env file found (checked dist-relative and cwd paths)");
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  let loaded = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded++;
    }
  }

  if (process.env.BOSSIM_AUTH_APP_URL || process.env.BOSSIM_BFF_URL) {
    console.log(
      `[load-dev-env] loaded ${loaded} vars from ${envPath} | authApp=${process.env.BOSSIM_AUTH_APP_URL ?? "(default)"}`,
    );
  }
}

loadDevEnvFile();
