/**
 * Shared CLI helpers for travel-planner scripts.
 */

/**
 * True when the user asked for help or passed no arguments.
 * @param {string[]} argv Typically `process.argv.slice(2)`.
 */
export function isCliHelp(argv) {
  if (argv.length === 0) return true;
  const a = argv[0];
  return a === "--help" || a === "-h" || a === "help";
}
