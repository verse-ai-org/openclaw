import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

export function buildFeasibilityVerdict(liveValidation, liveResults) {
  const transportRequired = liveValidation?.transport_required !== false;
  const flights = liveResults?.flights;
  const transport = liveResults?.transport;
  const weather = liveResults?.weather;

  const hasFlightResult = Array.isArray(flights)
    ? flights.length > 0
    : flights && Object.keys(flights).length > 0;
  const hasTransportResult = Array.isArray(transport)
    ? transport.length > 0
    : transport && Object.keys(transport).length > 0;
  const hasTransport = transportRequired ? hasFlightResult || hasTransportResult : true;

  // Weather block detection: look for block-level keywords in weather result
  const weatherText = JSON.stringify(weather || "").toLowerCase();
  const weatherBlocked =
    weatherText.includes("block") ||
    weatherText.includes("extreme") ||
    weatherText.includes("typhoon") ||
    weatherText.includes("blizzard");
  const weatherCaution =
    !weatherBlocked &&
    (weatherText.includes("caution") ||
      weatherText.includes("heavy rain") ||
      weatherText.includes("alert") ||
      weatherText.includes("snow"));

  let verdict;
  let reasons = [];

  if (weatherBlocked) {
    verdict = "block";
    reasons.push("Blocking weather risk detected in travel window.");
  } else if (transportRequired && !hasTransport) {
    verdict = "block";
    reasons.push("Long-distance transport is required but no viable option was found.");
  } else if (weatherCaution) {
    verdict = "caution";
    reasons.push("Weather risk warrants caution; check forecast before committing.");
  } else {
    verdict = "go";
  }

  if (!transportRequired) {
    reasons.push("Long-distance transport check skipped (local/nearby destination).");
  }

  return {
    verdict, // "go" | "caution" | "block"
    transport_ok: hasTransport,
    weather_ok: !weatherBlocked,
    reasons,
  };
}

export function buildLiveValidation() {
  throw new Error(
    "buildLiveValidation removed: agent now drives validation directly via SKILL.md step 5.",
  );
}

runScript({
  name: "route-validation.mjs",
  description: "对实时技能结果做可行性裁决（go/caution/block）",
  usage: "node route-validation.mjs --validation=<json|@file> --results=<json|@file>",
  flags: [
    { name: "validation", desc: "route_validation 对象（含 transport_required）" },
    { name: "results", desc: "实时技能结果对象（flights/transport/weather）" },
  ],
  required: ["validation", "results"],
  callerUrl: import.meta.url,
  run(args) {
    const validation = readJsonFromCliValue("validation", args.validation, undefined);
    const results = readJsonFromCliValue("results", args.results, {});
    console.log(JSON.stringify(buildFeasibilityVerdict(validation, results), null, 2));
  },
});
