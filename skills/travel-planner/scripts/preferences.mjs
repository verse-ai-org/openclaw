/**
 * Travel Planner Preferences Manager
 * Keeps preferences-related CLI commands separate from db.mjs.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertOnlyFlags, readJsonFromCliValue, requireCmd, runScript } from "./cli_args.mjs";

/** @type {string | null} */
let dbDirOverride = null;

const PACE_ALIASES = {
  relaxed: "relaxed",
  moderate: "moderate",
  intensive: "intensive",
  packed: "intensive",
};

export function setPreferencesDbDirForTests(dir) {
  dbDirOverride = dir;
}

function dbDir() {
  if (process.env.TRAVEL_PLANNER_DB_DIR) {
    return process.env.TRAVEL_PLANNER_DB_DIR;
  }
  return dbDirOverride ?? path.join(os.homedir(), ".openclaw", "agents", "travel-planner");
}

const preferencesFile = () => path.join(dbDir(), "preferences.json");

export function getPreferencesFilePath() {
  return preferencesFile();
}

function ensurePreferencesFile() {
  fs.mkdirSync(dbDir(), { recursive: true });
  if (!fs.existsSync(preferencesFile())) {
    const defaultPrefs = {
      initialized: false,
      created_at: new Date().toISOString(),
      travel_style: "",
      budget_level: "",
      accommodation_preference: [],
      hotel_preferences: [],
      interests: [],
      dietary_restrictions: [],
      accessibility_needs: [],
      preferred_activities: [],
      pace_preference: "",
      travel_companions: "",
      departure_city: "",
      transport_preferences: [],
      walking_tolerance: "",
      room_requirements: [],
      language_skills: [],
      previous_destinations: [],
      bucket_list: [],
    };
    fs.writeFileSync(preferencesFile(), JSON.stringify(defaultPrefs, null, 2), "utf8");
  }
}

function loadPreferencesJson() {
  ensurePreferencesFile();
  try {
    const raw = fs.readFileSync(preferencesFile(), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePreferencesJson(data) {
  ensurePreferencesFile();
  fs.writeFileSync(preferencesFile(), JSON.stringify(data, null, 2), "utf8");
}

export function normalizePacePreference(value) {
  if (value === undefined || value === null) return "";
  const key = String(value).trim().toLowerCase();
  if (!key) return "";
  return PACE_ALIASES[key] ?? key;
}

export function isInitialized() {
  const prefs = loadPreferencesJson();
  return prefs.initialized === true;
}

export function getPreferences() {
  const prefs = loadPreferencesJson();
  prefs.hotel_preferences ??= [];
  prefs.departure_city ??= "";
  prefs.transport_preferences ??= [];
  prefs.walking_tolerance ??= "";
  prefs.room_requirements ??= [];
  return prefs;
}

export function savePreferences(preferences) {
  const prefs = loadPreferencesJson();
  Object.assign(prefs, preferences);
  if (prefs.pace_preference !== undefined) {
    prefs.pace_preference = normalizePacePreference(prefs.pace_preference);
  }
  prefs.initialized = true;
  prefs.last_updated = new Date().toISOString();
  savePreferencesJson(prefs);
}

export function updatePreference(key, value) {
  const prefs = loadPreferencesJson();
  prefs[key] = key === "pace_preference" ? normalizePacePreference(value) : value;
  prefs.last_updated = new Date().toISOString();
  savePreferencesJson(prefs);
}

export function addToBucketList(destination, notes = "") {
  const prefs = loadPreferencesJson();
  prefs.bucket_list ??= [];
  prefs.bucket_list.push({
    destination,
    notes,
    added_at: new Date().toISOString(),
  });
  savePreferencesJson(prefs);
}

export function addPreviousDestination(destination) {
  const prefs = loadPreferencesJson();
  prefs.previous_destinations ??= [];
  if (!prefs.previous_destinations.includes(destination)) {
    prefs.previous_destinations.push(destination);
  }
  savePreferencesJson(prefs);
}

const CMD_FLAGS = {
  is_initialized: ["cmd"],
  save_preferences: ["cmd", "payload"],
  get_preferences: ["cmd"],
};

runScript({
  name: "preferences.mjs",
  description: "旅行规划偏好管理器，本地 JSON 存储于 ~/.openclaw/agents/travel-planner/",
  usage: "node preferences.mjs --cmd=<name> [其他 flag...]",
  flags: Object.keys(CMD_FLAGS)
    .flatMap((cmd) => CMD_FLAGS[cmd].map((f) => ({ name: f, desc: `用于 --cmd=${cmd}` })))
    .filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i),
  required: ["cmd"],
  callerUrl: import.meta.url,
  run(args) {
    const command = requireCmd(args);
    const allowed = CMD_FLAGS[command];
    if (allowed) assertOnlyFlags(args, allowed);

    if (command === "is_initialized") {
      console.log(isInitialized() ? "true" : "false");
    } else if (command === "save_preferences") {
      const payload = readJsonFromCliValue("save_preferences", args.payload, undefined);
      savePreferences(payload);
      console.log(JSON.stringify({ ok: true }, null, 2));
    } else if (command === "get_preferences") {
      console.log(JSON.stringify(getPreferences(), null, 2));
    } else {
      console.error(`未知 --cmd 值: ${command}`);
      process.exit(1);
    }
  },
});
