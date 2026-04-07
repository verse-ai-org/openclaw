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

function preferredHotelType(preferences) {
  const accommodation = preferences.accommodation_preference || [];
  if (!accommodation.length) return "酒店";
  const joined = accommodation.map(String).join(" ");
  if (joined.includes("民宿") || joined.toLowerCase().includes("airbnb")) return "民宿";
  if (joined.includes("客栈")) return "客栈";
  return "酒店";
}

function hotelSort(preferences) {
  return preferences.budget_level === "budget" ? "price_asc" : "rate_desc";
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
    const command = [
      "flyai",
      "search-flight",
      `--origin "${origin || "<departure-city>"}"`,
      `--destination "${destination}"`,
      `--dep-date ${depDate}`,
      `--back-date ${backDate}`,
      "--sort-type 3",
    ];
    if (perPersonCap) command.push(`--max-price ${perPersonCap}`);

    validations.push({
      decision: `Compare flight entry via ${destination}`,
      goal: "Validate whether this hub reduces total trip friction or price.",
      tool: "flyai search-flight",
      runner: "flyai",
      result_bucket: "flights",
      cli_args: [
        "search-flight",
        "--origin",
        origin || "<departure-city>",
        "--destination",
        destination,
        "--dep-date",
        depDate,
        "--back-date",
        backDate,
        "--sort-type",
        "3",
        ...(perPersonCap ? ["--max-price", String(perPersonCap)] : []),
      ],
      required_inputs: {
        origin: origin || "<departure-city>",
        destination,
        dep_date: depDate,
        back_date: backDate,
      },
      example_command: command.join(" "),
    });

    if (index === 0 && (selectedRoute.departure_hubs || []).length > 1) {
      const altDeparture = selectedRoute.departure_hubs[0];
      validations.push({
        decision: `Check open-jaw exit via ${altDeparture}`,
        goal: "Verify whether the route should exit from a different city instead of round-trip routing.",
        tool: "flyai search-flight",
        runner: "flyai",
        result_bucket: "flights",
        cli_args: [
          "search-flight",
          "--origin",
          altDeparture,
          "--destination",
          origin || "<departure-city>",
          "--dep-date",
          backDate,
          "--sort-type",
          "3",
        ],
        required_inputs: {
          origin: altDeparture,
          destination: origin || "<departure-city>",
          dep_date: backDate,
        },
        example_command:
          `flyai search-flight --origin "${altDeparture}" --destination "${origin || "<departure-city>"}" ` +
          `--dep-date ${backDate} --sort-type 3`,
      });
      break;
    }
  }

  return validations;
}

function hotelValidation(tripData, selectedRoute, preferences) {
  const hotelType = preferredHotelType(preferences);
  const sort = hotelSort(preferences);
  const checkIn = safeDate(tripData.departure_date || "", 30);
  const duration = Number.parseInt(String(tripData.duration_days || 7), 10);
  const checkOut = safeDate(tripData.return_date || "", 30 + duration);
  const budgetTotal = Number.parseFloat(String(tripData.budget?.total || 0));
  const nightlyCap = budgetTotal ? Math.floor((budgetTotal * 0.35) / Math.max(duration, 1)) : null;

  const validations = [];
  for (const base of (selectedRoute.hotel_bases || []).slice(0, 3)) {
    const command = [
      "flyai",
      "search-hotel",
      `--dest-name "${base}"`,
      `--hotel-types "${hotelType}"`,
      `--sort ${sort}`,
      `--check-in-date ${checkIn}`,
      `--check-out-date ${checkOut}`,
    ];
    if (nightlyCap) command.push(`--max-price ${nightlyCap}`);

    validations.push({
      decision: `Validate hotel base in ${base}`,
      goal: "Check that the hotel zone is strong enough before writing detailed days.",
      tool: "flyai search-hotel",
      runner: "flyai",
      result_bucket: "hotels",
      cli_args: [
        "search-hotel",
        "--dest-name",
        base,
        "--hotel-types",
        hotelType,
        "--sort",
        sort,
        "--check-in-date",
        checkIn,
        "--check-out-date",
        checkOut,
        ...(nightlyCap ? ["--max-price", String(nightlyCap)] : []),
      ],
      required_inputs: {
        dest_name: base,
        check_in_date: checkIn,
        check_out_date: checkOut,
        hotel_type: hotelType,
      },
      example_command: command.join(" "),
    });
  }
  return validations;
}

function poiValidation(selectedRoute) {
  const category = String(selectedRoute.style || "").includes("nature") ? "自然风光" : "人文古迹";
  return (selectedRoute.poi_cities || []).slice(0, 2).map((city) => ({
    decision: `Confirm anchor POIs in ${city}`,
    goal: "Validate that the route still has enough bookable or high-value anchor stops in this city.",
    tool: "flyai search-poi",
    runner: "flyai",
    result_bucket: "pois",
    cli_args: ["search-poi", "--city-name", city, "--category", category],
    required_inputs: {
      city_name: city,
      category,
    },
    example_command: `flyai search-poi --city-name "${city}" --category "${category}"`,
  }));
}

function chinaTransportValidation(selectedRoute) {
  const regions = selectedRoute.regions || [];
  if (!regions.length) return [];
  return [
    {
      decision: "Validate intra-China transfer realism",
      goal: "Use maps or rail search to confirm that the hotel bases and scenic day trips are still realistic.",
      tools: ["amap-lbs-skill", "12306"],
      runner: "manual",
      result_bucket: "transport",
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
      tool: "12306 query",
      runner: "12306",
      result_bucket: "transport",
      cli_args: [
        "node",
        "{12306_baseDir}/scripts/query.mjs",
        origin,
        destination,
        "--date",
        dateValue,
        "--json",
      ],
      required_inputs: {
        from: origin,
        to: destination,
        date: dateValue,
      },
      example_command: `node {12306_baseDir}/scripts/query.mjs ${origin} ${destination} --date ${dateValue} --json`,
    });
  }
  return validations;
}

export function buildLiveValidation(tripData, selectedRoute, preferences) {
  const destinationCountry = String((tripData.destination || {}).country || "").toLowerCase();
  const hotelChecks = hotelValidation(tripData, selectedRoute, preferences);
  const flightChecks = flightValidation(tripData, selectedRoute, preferences);
  const poiChecks = poiValidation(selectedRoute);
  const china =
    ["china", "cn", "中国"].includes(destinationCountry)
      ? chinaTransportValidation(selectedRoute)
      : [];
  const rail =
    ["china", "cn", "中国"].includes(destinationCountry) ? railValidation(tripData) : [];

  const decisionGates = [
    {
      name: "Arrival / departure hub",
      ready_when: "One entry-exit pattern clearly wins on total friction or price.",
      depends_on: ["flight validation"],
    },
    {
      name: "Hotel base strategy",
      ready_when: "At least one hotel zone is validated for each required base.",
      depends_on: ["hotel validation", "map validation"],
    },
    {
      name: "Anchor day structure",
      ready_when: "The route has enough strong anchor POIs to support each core day.",
      depends_on: ["poi validation"],
    },
  ];

  const bookingReadySections = [
    "summary recommendation",
    "transport choice with live options",
    "hotel zone and 2-3 hotel candidates",
    "day-by-day execution cards",
    "budget and booking watchouts",
  ];

  return {
    stage: "validation",
    priority_checks: selectedRoute.validation_focus || [],
    tool_plan: {
      flights: flightChecks,
      hotels: hotelChecks,
      pois: poiChecks,
      transport: [...china, ...rail],
    },
    decision_gates: decisionGates,
    booking_ready_sections: bookingReadySections,
    response_upgrade_rule:
      "Once one strong transport option and one strong hotel base per required stop are validated, " +
      "promote the response from route framing into a booking-ready plan.",
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
