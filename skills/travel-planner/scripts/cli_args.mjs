/**
 * Shared CLI parsing: only `--key=value` (aligned with skills/amap-lbs-skill/scripts).
 * JSON values may be inline or `@/path/to.json` (path resolved from cwd).
 */

import fs from "node:fs";
import path from "node:path";

/**
 * True when the user asked for help or passed no arguments.
 * @param {string[]} argv Typically `process.argv.slice(2)`.
 */
export function isCliHelp(argv) {
  if (argv.length === 0) return true;
  const a = argv[0];
  return a === "--help" || a === "-h" || a === "help";
}

/**
 * Parse argv to `--key=value` flags only.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseCliArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const token of argv) {
    if (!token.startsWith("--")) {
      console.error(`Error: unexpected argument "${token}" (use --key=value)`);
      process.exit(1);
    }
    const eq = token.indexOf("=");
    if (eq <= 2) {
      console.error(`Error: malformed flag "${token}" (expected --key=value)`);
      process.exit(1);
    }
    const key = token.slice(2, eq);
    const value = token.slice(eq + 1);
    if (key === "") {
      console.error(`Error: malformed flag "${token}" (expected --key=value)`);
      process.exit(1);
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      console.error(`Error: duplicate flag --${key}`);
      process.exit(1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {Record<string, string>} record
 * @param {string[]} allowed flag names without `--`
 */
export function assertOnlyFlags(record, allowed) {
  const keys = Object.keys(record);
  const bad = keys.filter((k) => !allowed.includes(k));
  if (bad.length) {
    console.error(`Error: unexpected flag(s): ${bad.map((k) => `--${k}`).join(", ")}`);
    process.exit(1);
  }
}

export function requireCmd(args) {
  const cmd = args.cmd;
  if (!cmd || cmd === "") {
    console.error("Error: --cmd=<name> is required (use --help for usage)");
    process.exit(1);
  }
  return cmd;
}

/**
 * @param {Record<string, string>} args
 * @param {string} name flag without `--`
 */
export function requireFlag(args, name) {
  const v = args[name];
  if (v === undefined || v === "") {
    console.error(`Error: --${name}=... is required (use --help for usage)`);
    process.exit(1);
  }
  return v;
}

/**
 * @param {string} label Human-readable name for errors
 * @param {string | undefined} raw Value from args[key]
 * @param {unknown} [fallback] If raw is missing or "", return fallback
 */
export function readJsonFromCliValue(label, raw, fallback) {
  if (raw === undefined || raw === "") {
    if (fallback !== undefined) {
      return fallback;
    }
    console.error(`Error: missing value for ${label}`);
    process.exit(1);
  }
  let text = raw;
  if (raw.startsWith("@")) {
    const filePath = path.resolve(process.cwd(), raw.slice(1));
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: cannot read ${label} from ${filePath}: ${msg}`);
      process.exit(1);
    }
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let hint = "";
    if (msg.includes("Unexpected non-whitespace character after JSON")) {
      hint =
        "\nHint: JSON ended before the string did — usually an extra `}` after a nested object (e.g. after `hotels`) so the next key (`pois`, etc.) sits outside the root object. Count braces.";
    } else if (msg.includes("Unexpected token") && msg.includes("JSON")) {
      hint = "\nHint: check for trailing commas, unescaped quotes, or broken string quoting in the shell.";
    }
    console.error(`Error: invalid JSON for ${label} (${msg})${hint}`);
    process.exit(1);
  }
}
