import { fileURLToPath } from "node:url";

import {
  assertOnlyFlags,
  isCliHelp,
  parseCliArgs,
  readJsonFromCliValue,
  requireFlag,
} from "./cli_args.mjs";

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/[,\s]/g, "");
  if (!normalized) return 0;
  if (normalized.endsWith("w")) return Math.round(Number.parseFloat(normalized.slice(0, -1)) * 10000);
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pickLikeCount(item) {
  return Math.max(
    toNumber(item?.like_count),
    toNumber(item?.liked_count),
    toNumber(item?.interact_info?.liked_count),
    toNumber(item?.interaction?.likes),
    toNumber(item?.metrics?.likes),
  );
}

function isVideoNote(item) {
  const candidates = [
    String(item?.note_type || ""),
    String(item?.type || ""),
    String(item?.model_type || ""),
    String(item?.display_type || ""),
  ].join(" ").toLowerCase();
  return candidates.includes("视频") || candidates.includes("video");
}

function parseLoopFromText(text, destinationHint) {
  const cleaned = String(text || "").replace(/\s+/g, "");
  if (!cleaned) return [];
  const delimiter = cleaned.includes("→") ? "→" : cleaned.includes("-") ? "-" : cleaned.includes("—") ? "—" : "";
  if (!delimiter) {
    return destinationHint ? [destinationHint] : [];
  }
  const parts = cleaned
    .split(delimiter)
    .map((part) => part.replace(/[D天第\d日]/g, "").trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts : destinationHint ? [destinationHint] : [];
}

export function buildXhsSearchQueries(destinationText, durationDays) {
  const d = Number.parseInt(String(durationDays || 0), 10);
  const dayPart = d > 0 ? `${d}天行程安排` : "行程安排";
  const destination = String(destinationText || "").trim();
  return [
    `J人${destination}${dayPart}`.trim(),
    `J人${destination}${dayPart}攻略`.trim(),
    `${destination}${dayPart}`.trim(),
  ].filter(Boolean);
}

export function buildXhsEvidence(input = {}) {
  const destinationText = String(input.destination_text || "").trim();
  const durationDays = Number.parseInt(String(input.duration_days || 0), 10) || 0;
  const searchResults = Array.isArray(input.search_results) ? input.search_results : [];

  const filtered = searchResults
    .filter((item) => !isVideoNote(item))
    .map((item) => ({
      id: item?.id || item?.note_id || "",
      title: String(item?.title || item?.name || "").trim(),
      url: String(item?.url || item?.note_url || "").trim(),
      like_count: pickLikeCount(item),
      text: String(item?.desc || item?.description || item?.title || "").trim(),
      note_type: String(item?.note_type || item?.type || "").trim(),
    }))
    .filter((item) => item.url && item.title)
    .sort((a, b) => b.like_count - a.like_count);

  const top = filtered.slice(0, 3);
  const loops = top
    .map((item) => parseLoopFromText(item.text, destinationText))
    .filter((loop) => loop.length > 0);
  const stops = [...new Set(loops.flat())].filter(Boolean).slice(0, 10);

  return {
    query: {
      destination_text: destinationText,
      duration_days: durationDays,
      search_keywords: buildXhsSearchQueries(destinationText, durationDays),
      search_filters: {
        note_type: "图文",
        sort_by: "最多点赞",
      },
    },
    evidence_quality: top.length >= 2 && loops.length > 0 ? "high" : top.length > 0 ? "medium" : "low",
    generated_at: new Date().toISOString(),
    sources: top.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      like_count: item.like_count,
      note_type: item.note_type || "图文",
    })),
    route_hints: {
      popular_loops: loops,
      popular_stops: stops,
    },
    risk_hints: [],
    stay_hints: {
      recommended_bases: stops.slice(0, 3),
    },
    summary:
      top.length > 0
        ? `Selected ${top.length} high-like graphic-note posts for route framing.`
        : "No usable Xiaohongshu graphic notes were found.",
  };
}

function printHelp() {
  console.log(`xhs_evidence_builder.mjs — normalize Xiaohongshu search results

Usage:
  node xhs_evidence_builder.mjs --input=<json_or_@file>

Input shape:
  {
    "destination_text":"川西",
    "duration_days":5,
    "search_results":[...]
  }
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printHelp();
    process.exit(0);
  }
  const args = parseCliArgs(argv);
  assertOnlyFlags(args, ["input"]);
  requireFlag(args, "input");
  const payload = readJsonFromCliValue("input", args.input, undefined);
  console.log(JSON.stringify(buildXhsEvidence(payload), null, 2));
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
