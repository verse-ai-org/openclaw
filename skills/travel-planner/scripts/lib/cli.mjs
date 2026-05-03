export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) out[body] = true;
    else out[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return out;
}

export function requireFlag(args, name) {
  const v = args[name];
  if (v == null || v === true || String(v).trim() === "") {
    throw new Error(`missing required flag: --${name}`);
  }
  return String(v);
}

export function optionalFlag(args, name, fallback = "") {
  const v = args[name];
  if (v == null || v === true) return fallback;
  const s = String(v);
  return s.trim() === "" ? fallback : s;
}

export function printJson(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

export function failJson(message, extra = {}) {
  printJson({ ok: false, code: "ERROR", message, ...extra });
  process.exitCode = 1;
}

export function okJson(extra = {}) {
  printJson({ ok: true, ...extra });
}

