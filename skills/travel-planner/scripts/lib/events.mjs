import fs from "node:fs";
import { ensureDir } from "./json.mjs";
import { tripDir, tripEventsFile } from "./paths.mjs";

export function appendTripEvent(tripId, type, payload = {}) {
  ensureDir(tripDir(tripId));
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: String(type),
    payload: payload && typeof payload === "object" ? payload : { value: payload },
  });
  fs.appendFileSync(tripEventsFile(tripId), `${line}\n`, "utf8");
}

