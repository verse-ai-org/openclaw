import path from "node:path";
import os from "node:os";

export const ENV_DB_DIR = "TRAVEL_PLANNER_DB_DIR";

export function dbDir() {
  const override = process.env[ENV_DB_DIR];
  if (override && String(override).trim() !== "") return String(override);
  return path.join(os.homedir(), ".openclaw", "agents", "travel-planner");
}

export function tripsIndexFile() {
  return path.join(dbDir(), "trips.json");
}

export function preferencesFile() {
  return path.join(dbDir(), "preferences.json");
}

export function dataDir() {
  return path.join(dbDir(), "data");
}

export function tripsDataDir() {
  return path.join(dataDir(), "trips");
}

export function tripDir(tripId) {
  return path.join(tripsDataDir(), String(tripId));
}

export function poiDir() {
  return path.join(dataDir(), "poi");
}

export function tripEventsFile(tripId) {
  return path.join(tripDir(tripId), "events.jsonl");
}

export function artifactPath(tripId, name) {
  return path.join(tripDir(tripId), `${String(name)}.json`);
}

