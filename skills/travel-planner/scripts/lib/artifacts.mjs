import fs from "node:fs";
import path from "node:path";
import { artifactPath, tripDir } from "./paths.mjs";
import { ensureDir, readJsonFile, writeJsonAtomic } from "./json.mjs";

export function ensureTripDir(tripId) {
  ensureDir(tripDir(tripId));
}

export function existsArtifact(tripId, name) {
  return fs.existsSync(artifactPath(tripId, name));
}

export function readArtifact(tripId, name) {
  const p = artifactPath(tripId, name);
  if (!fs.existsSync(p)) return null;
  return readJsonFile(p);
}

export function writeArtifact(tripId, name, data) {
  ensureTripDir(tripId);
  const p = artifactPath(tripId, name);
  writeJsonAtomic(p, data);
  return path.relative(tripDir(tripId), p);
}

