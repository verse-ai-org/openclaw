import fs from "node:fs";
import { parseArgs, requireFlag, okJson, failJson } from "./lib/cli.mjs";
import { preferencesFile, dbDir } from "./lib/paths.mjs";
import { ensureDir, readJsonFile, writeJsonAtomic, readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { validatePreferences } from "./lib/schema.mjs";

function ensurePreferencesFile() {
  ensureDir(dbDir());
  if (!fs.existsSync(preferencesFile())) writeJsonAtomic(preferencesFile(), {});
}

function loadPreferences() {
  ensurePreferencesFile();
  return readJsonFile(preferencesFile());
}

function savePreferences(payload) {
  const current = loadPreferences();
  const next = { ...current, ...(payload && typeof payload === "object" ? payload : {}) };
  const check = validatePreferences(next);
  if (!check.ok) return { ok: false, reasons: check.reasons };
  writeJsonAtomic(preferencesFile(), next);
  return { ok: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = String(args.cmd || "").trim();

  try {
    if (!cmd || cmd === "help") {
      okJson({
        commands: ["is_initialized", "get", "save"],
        contract: {
          save_semantics:
            "Partial update: only fields present in payload are written (merged). Missing fields are NOT cleared.",
          payload_source:
            "Agent should build --payload from user's explicit answers. Prefer metadata.interaction.payload (from question_flow) when available; fallback to parsing the user's Q/A text if needed.",
        },
        env: { TRAVEL_PLANNER_DB_DIR: dbDir() },
      });
      return;
    }

    if (cmd === "is_initialized") {
      ensurePreferencesFile();
      const p = loadPreferences();
      okJson({ initialized: Object.keys(p || {}).length > 0 });
      return;
    }

    if (cmd === "get") {
      okJson({ preferences: loadPreferences() });
      return;
    }

    if (cmd === "save") {
      const raw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(raw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const result = savePreferences(parsed.data);
      if (!result.ok) return failJson("save rejected", { reasons: result.reasons });
      okJson();
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();
