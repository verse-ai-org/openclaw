/**
 * Booking-oriented validation helpers (Node port of live_validation.py)
 */

import { fileURLToPath } from "node:url";

import {
  assertOnlyFlags,
  isCliHelp,
  parseCliArgs,
  readJsonFromCliValue,
  requireFlag,
} from "./cli_args.mjs";

function safeDate(value, fallbackDays) {
  if (value) return value;
  const d = new Date();
  d.setDate(d.getDate() + fallbackDays);
  return d.toISOString().slice(0, 10);
}

function extractDepartureCity(tripData, preferences) {
  return (
    tripData.departure_city ||
    preferences.departure_city ||
    tripData.origin_city ||
    ""
  );
}

function flightValidation(tripData, selectedRoute, preferences) {
  const origin = extractDepartureCity(tripData, preferences);
  const depDate = safeDate(tripData.departure_date || "", 30);
  const backDate = safeDate(tripData.return_date || "", 37);
  const budgetTotal = Number.parseFloat(String(tripData.budget?.total || 0));
  const travelers = Number.parseInt(String(tripData.travelers || 2), 10);
  const perPersonCap = budgetTotal ? Math.floor((budgetTotal / travelers) * 0.35) : null;

  const validations = [];
  const hubs = (selectedRoute.arrival_hubs || []).slice(0, 2);

  for (let index = 0; index < hubs.length; index++) {
    const destination = hubs[index];
    validations.push({
      decision: `Compare flight entry via ${destination}`,
      goal: "Validate whether this hub reduces total trip friction or price.",
      tool: "@skills/flyai search-flight",
      skill: "@skills/flyai",
      runner: "skill",
      result_bucket: "flights",
      skill_action: "search-flight",
      skill_input: {
        origin: origin || "<departure-city>",
        destination,
        dep_date: depDate,
        back_date: backDate,
        sort_type: 3,
        ...(perPersonCap ? { max_price: perPersonCap } : {}),
      },
      required_inputs: {
        origin: origin || "<departure-city>",
        destination,
        dep_date: depDate,
        back_date: backDate,
      },
      skill_hint: "Call @skills/flyai with search-flight; do not call provider internals directly.",
    });

    if (index === 0 && (selectedRoute.departure_hubs || []).length > 1) {
      const altDeparture = selectedRoute.departure_hubs[0];
      validations.push({
        decision: `Check open-jaw exit via ${altDeparture}`,
        goal: "Verify whether the route should exit from a different city instead of round-trip routing.",
        tool: "@skills/flyai search-flight",
        skill: "@skills/flyai",
        runner: "skill",
        result_bucket: "flights",
        skill_action: "search-flight",
        skill_input: {
          origin: altDeparture,
          destination: origin || "<departure-city>",
          dep_date: backDate,
          sort_type: 3,
        },
        required_inputs: {
          origin: altDeparture,
          destination: origin || "<departure-city>",
          dep_date: backDate,
        },
        skill_hint: "Call @skills/flyai with search-flight for return-leg comparison.",
      });
      break;
    }
  }

  return validations;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/\s+/g, "");
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(v)) return true;
    if (["false", "0", "no"].includes(v)) return false;
  }
  return null;
}

function needsLongDistanceTransport(tripData, selectedRoute, preferences) {
  const explicitRoute = parseBooleanLike(selectedRoute.long_distance_transport_required);
  if (explicitRoute !== null) {
    return {
      required: explicitRoute,
      reason: explicitRoute
        ? "Route explicitly marks long-distance transport as required."
        : "Route explicitly marks long-distance transport as not required.",
    };
  }

  const explicitTrip = parseBooleanLike(tripData.long_distance_transport_required);
  if (explicitTrip !== null) {
    return {
      required: explicitTrip,
      reason: explicitTrip
        ? "Trip explicitly marks long-distance transport as required."
        : "Trip explicitly marks long-distance transport as not required.",
    };
  }

  const arrivalHubs = (selectedRoute.arrival_hubs || []).length;
  const departureHubs = (selectedRoute.departure_hubs || []).length;
  const railSegments = (tripData.rail_segments || []).filter((seg) => seg?.from && seg?.to).length;
  if (arrivalHubs > 0 || departureHubs > 0 || railSegments > 0) {
    return {
      required: true,
      reason: "Route contains explicit hub or rail-segment hints.",
    };
  }

  const departure = normalizeText(extractDepartureCity(tripData, preferences));
  const destinationText = normalizeText(
    tripData.destination_text || tripData.destination?.region || tripData.destination?.city || "",
  );
  if (departure && destinationText) {
    if (destinationText.includes(departure) || departure.includes(destinationText)) {
      return {
        required: false,
        reason: "Departure and destination look local/nearby; long-distance check skipped.",
      };
    }
    return {
      required: true,
      reason: "Departure and destination differ; long-distance transport likely needed.",
    };
  }

  return {
    required: true,
    reason: "Missing clear locality signal; keep long-distance check enabled by default.",
  };
}

function weatherValidation(tripData, selectedRoute, preferences) {
  const destination = tripData.destination_text || selectedRoute.region || selectedRoute.title || "<destination>";
  const startDate = safeDate(tripData.departure_date || "", 30);
  const endDate = safeDate(tripData.return_date || "", 37);
  const pace = preferences.pace_preference || tripData.pace_preference || "moderate";
  return [
    {
      decision: `Check weather risk window for ${destination}`,
      goal: "Surface weather risks early and warn user before detailed day planning.",
      tool: "@skills/weather forecast check",
      skill: "@skills/weather",
      runner: "skill",
      result_bucket: "weather",
      skill_params: {
        location: destination,
        start_date: startDate,
        end_date: endDate,
      },
      required_inputs: {
        destination,
        start_date: startDate,
        end_date: endDate,
      },
      risk_rules: [
        "Mark caution if 2+ consecutive days show heavy rain/snow/wind alerts.",
        "Mark caution if extreme heat/cold likely affects outdoor anchor points.",
        "Mark block only when transport safety or core route continuity is at risk.",
      ],
      notes: `Pace preference is "${pace}"; evaluate weather risk against this activity intensity.`,
      skill_hint:
        "Use @skills/weather for current + forecast weather in this window, then classify go/caution/block.",
    },
  ];
}

function chinaTransportValidation(selectedRoute) {
  const regions = selectedRoute.regions || [];
  if (!regions.length) return [];
  return [
    {
      decision: "Validate intra-China transfer realism",
      goal: "Use maps or rail search to confirm that the hotel bases and scenic day trips are still realistic.",
      tools: ["@skills/amap-lbs-skill", "@skills/12306"],
      runner: "manual",
      result_bucket: "transport",
      skill_hints: [
        "Use @skills/amap-lbs-skill for realistic transfer times.",
        "Use @skills/12306 if rail may beat road transfer.",
      ],
      queries: [
        `Check route time between ${regions[0]} and ${regions[Math.min(1, regions.length - 1)]}`,
        "Check if any rail segment is better than a road transfer where relevant",
      ],
    },
  ];
}

function railValidation(tripData) {
  const validations = [];
  for (const segment of tripData.rail_segments || []) {
    const origin = segment.from;
    const destination = segment.to;
    if (!origin || !destination) continue;
    const dateValue = segment.date || safeDate(tripData.departure_date || "", 30);
    validations.push({
      decision: `Validate rail segment ${origin} -> ${destination}`,
      goal: "Check whether this train leg is a realistic alternative to a road or flight transfer.",
      tool: "@skills/12306 query",
      skill: "@skills/12306",
      runner: "skill",
      result_bucket: "transport",
      skill_action: "query",
      skill_params: {
        from: origin,
        to: destination,
        date: dateValue,
        output: "json",
      },
      required_inputs: {
        from: origin,
        to: destination,
        date: dateValue,
      },
      skill_hint:
        "Call @skills/12306 with from/to/date; avoid direct script invocation from travel-planner.",
    });
  }
  return validations;
}

export function buildLiveValidation(tripData, selectedRoute, preferences) {
  const destinationCountry = String((tripData.destination || {}).country || "").toLowerCase();
  const transportNeed = needsLongDistanceTransport(tripData, selectedRoute, preferences);
  const flightChecks = transportNeed.required ? flightValidation(tripData, selectedRoute, preferences) : [];
  const weatherChecks = weatherValidation(tripData, selectedRoute, preferences);
  const china =
    transportNeed.required && ["china", "cn", "中国"].includes(destinationCountry)
      ? chinaTransportValidation(selectedRoute)
      : [];
  const rail =
    transportNeed.required && ["china", "cn", "中国"].includes(destinationCountry)
      ? railValidation(tripData)
      : [];

  const decisionGates = [
    {
      name: "Transport feasibility",
      ready_when: transportNeed.required
        ? "At least one realistic long-distance transport path is validated."
        : "Long-distance transport is not required for this trip.",
      depends_on: transportNeed.required ? ["flight validation", "rail/map validation"] : ["not required"],
    },
    {
      name: "Weather feasibility",
      ready_when: "No blocking weather risk is detected in the travel window.",
      depends_on: ["weather validation"],
    },
  ];

  const bookingReadySections = [
    "feasibility verdict (go/caution/block)",
    "transport risk summary",
    "weather risk summary",
    "deferred checks and next action",
  ];

  return {
    stage: "validation",
    priority_checks: selectedRoute.validation_focus || [],
    transport_required: transportNeed.required,
    transport_requirement_reason: transportNeed.reason,
    tool_plan: {
      flights: flightChecks,
      hotels: [],
      pois: [],
      transport: [...china, ...rail],
      weather: weatherChecks,
    },
    decision_gates: decisionGates,
    booking_ready_sections: bookingReadySections,
    deferred_checks: [
      "Hotel options are intentionally deferred to daily-plan / booking stage; only risk reminders are needed now.",
    ],
    feasibility: {
      status: "pending_confirmation",
      requires_user_confirmation: true,
      confirmation_question:
        "轻验证已完成（交通 + 天气）。是否确认进入下一步细化？若不确认可先调整路线或日期。",
      next_step_options: [
        {
          id: "confirm_and_continue",
          label: "确认并继续",
          description: "Proceed to the next planning step.",
        },
        {
          id: "revise_route_or_dates",
          label: "先调整路线/日期",
          description: "Revise route or dates before moving forward.",
        },
      ],
    },
    response_upgrade_rule:
      "Once transport feasibility (when required) and weather risk are checked, ask for user confirmation " +
      "before promoting the response to the next planning stage.",
  };
}

function printLiveValidationHelp() {
  console.log(`live_validation.mjs — build validation package (does not call external APIs)

All flags use --key=value. JSON may be inline or @path.

Usage:
  node live_validation.mjs --trip=<trip_json|@file> --route=<route_json|@file> [--preferences=<json|@file>]

Options:
  --trip          Required. Trip object.
  --route         Required. Selected route object.
  --preferences   Optional (default {}).
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printLiveValidationHelp();
    process.exit(0);
  }
  const args = parseCliArgs(argv);
  assertOnlyFlags(args, ["trip", "route", "preferences"]);
  requireFlag(args, "trip");
  requireFlag(args, "route");
  const trip = readJsonFromCliValue("trip", args.trip, undefined);
  const route = readJsonFromCliValue("route", args.route, undefined);
  const preferences = readJsonFromCliValue("preferences", args.preferences, {});
  console.log(JSON.stringify(buildLiveValidation(trip, route, preferences), null, 2));
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
