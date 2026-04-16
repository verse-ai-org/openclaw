/**
 * Step 5 辅助：根据 SKILL.md 中的 `route_validation` 形状（及可选的 `live_results`）
 * 推导 `verdict` / `verdict_reasons`。Agent 仍应人工核对后 `patch_trip` 持久化。
 */

import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function hasNonemptyRecord(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function inferTransportOk(transportRequired, transportResult, liveResults) {
  const tr = transportResult && typeof transportResult === "object" ? transportResult : {};
  const status = String(tr.status || "").toLowerCase();
  if (status === "not_required") return true;
  if (status === "ok") return true;
  if (status === "unavailable") return false;

  const lr = liveResults && typeof liveResults === "object" ? liveResults : {};
  const flights = lr.flights;
  const transport = lr.transport;
  const hasFlightResult = Array.isArray(flights)
    ? flights.length > 0
    : hasNonemptyRecord(flights);
  const hasTransportResult = Array.isArray(transport)
    ? transport.length > 0
    : hasNonemptyRecord(transport);
  if (transportRequired) return hasFlightResult || hasTransportResult;
  return true;
}

function weatherTextForScan(routeValidation, liveResults) {
  const wr = routeValidation?.weather_result;
  const raw = wr && typeof wr === "object" ? wr.raw : {};
  const lr = liveResults && typeof liveResults === "object" ? liveResults : {};
  return JSON.stringify({ raw, weather: lr.weather }).toLowerCase();
}

function scanWeatherRisk(routeValidation, liveResults) {
  const wr = routeValidation?.weather_result;
  const ws = String(wr?.status || "").toLowerCase();
  if (ws === "block") return { blocked: true, caution: false, fromAgent: true };
  if (ws === "caution") return { blocked: false, caution: true, fromAgent: true };
  if (ws === "go") return { blocked: false, caution: false, fromAgent: true };

  const weatherText = weatherTextForScan(routeValidation, liveResults);
  const blocked =
    weatherText.includes("block") ||
    weatherText.includes("extreme") ||
    weatherText.includes("typhoon") ||
    weatherText.includes("blizzard");
  const caution =
    !blocked &&
    (weatherText.includes("caution") ||
      weatherText.includes("heavy rain") ||
      weatherText.includes("alert") ||
      weatherText.includes("snow"));
  return { blocked, caution, fromAgent: false };
}

/**
 * @param {object} routeValidation — SKILL Step 5 `route_validation`（含 transport_result / weather_result）
 * @param {object} [liveResults] — 可选 `trip.live_results` 形状，用于 status 未设满时的兜底推断
 * @returns {{ verdict: string, verdict_reasons: string[], transport_ok: boolean, weather_ok: boolean, reasons: string[] }}
 */
export function buildFeasibilityVerdict(routeValidation, liveResults = {}) {
  const rv = routeValidation && typeof routeValidation === "object" ? routeValidation : {};
  const tr = rv.transport_result && typeof rv.transport_result === "object" ? rv.transport_result : {};
  const transportRequired = tr.required !== false;
  const transportStatus = String(tr.status || "").toLowerCase();

  const transportOk = inferTransportOk(transportRequired, tr, liveResults);
  const { blocked: weatherBlocked, caution: weatherCaution, fromAgent: weatherFromAgent } =
    scanWeatherRisk(rv, liveResults);

  const weatherOk = !weatherBlocked;
  const reasons = [];
  const verdictReasons = [];

  let verdict;

  if (weatherBlocked) {
    verdict = "block";
    reasons.push("Blocking weather risk detected.");
    verdictReasons.push(
      weatherFromAgent && String(rv.weather_result?.status || "").toLowerCase() === "block"
        ? "Weather status is block per Step 5 rules."
        : "Blocking weather risk detected in travel window.",
    );
  } else if (transportRequired && transportStatus === "unavailable") {
    verdict = "block";
    reasons.push("Transport required but marked unavailable.");
    verdictReasons.push("Long-distance transport is required but no viable option was found.");
  } else if (transportRequired && !transportOk) {
    verdict = "block";
    reasons.push("Long-distance transport is required but no viable option was found.");
    verdictReasons.push("Long-distance transport is required but no viable option was found.");
  } else if (weatherCaution) {
    verdict = "caution";
    reasons.push("Weather risk warrants caution.");
    verdictReasons.push(
      weatherFromAgent && String(rv.weather_result?.status || "").toLowerCase() === "caution"
        ? "Weather status is caution per Step 5 rules."
        : "Weather risk warrants caution; check forecast before committing.",
    );
  } else {
    verdict = "go";
    verdictReasons.push("Transport and weather checks show no blocking issues.");
  }

  if (!transportRequired) {
    reasons.push("Long-distance transport check skipped (local/nearby or not_required).");
  }

  return {
    verdict,
    verdict_reasons: verdictReasons.length ? verdictReasons : [...reasons],
    transport_ok: transportOk,
    weather_ok: weatherOk,
    reasons,
  };
}

runScript({
  name: "route-validation.mjs",
  description:
    "Step 5 辅助：根据 route_validation（+可选 live_results）推导 go/caution/block，供 patch_trip 前核对",
  usage:
    "node route-validation.mjs --validation=<json|@file> [--results=<json|@file>] [--with-timestamp]",
  flags: [
    { name: "validation", desc: "route_validation 对象（Step 5 写入结构）" },
    { name: "results", desc: "可选 live_results（flights/transport/weather）" },
    { name: "with-timestamp", desc: "为 true 时输出 suggested checked_at（ISO）" },
  ],
  required: ["validation"],
  callerUrl: import.meta.url,
  run(args) {
    const validation = readJsonFromCliValue("validation", args.validation, undefined);
    const results = readJsonFromCliValue("results", args.results, {});
    const out = buildFeasibilityVerdict(validation, results);
    if (String(args["with-timestamp"] || "").toLowerCase() === "true") {
      out.checked_at_suggestion = new Date().toISOString();
    }
    console.log(JSON.stringify(out, null, 2));
  },
});
