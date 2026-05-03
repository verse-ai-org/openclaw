import fs from "node:fs";
import path from "node:path";

export function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

export function readMaybeJsonFromCliValue(value) {
  if (value == null) return { ok: false, error: "missing value" };
  const s = String(value);
  try {
    if (s.startsWith("@")) {
      const p = s.slice(1);
      const data = readJsonFile(p);
      return { ok: true, data, source: p };
    }
    const data = JSON.parse(s);
    return { ok: true, data, source: "inline" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

