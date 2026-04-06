/**
 * Route framing helpers (Node port of route_selector.py)
 */

import { fileURLToPath } from "node:url";

import { isCliHelp } from "./cli-help.mjs";

function normalizeText(value) {
  return String(value).trim().toLowerCase();
}

function destinationKey(tripRequest) {
  const destination = tripRequest.destination || {};
  const parts = [
    destination.city || "",
    destination.region || "",
    destination.country || "",
    tripRequest.destination_text || "",
  ];
  const text = parts.filter(Boolean).join(" ");
  const normalized = normalizeText(text);
  if (normalized.includes("xinjiang") || text.includes("新疆")) return "xinjiang";
  return "generic";
}

function containsAny(values, keywords) {
  const haystack = values.join(" ").toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

function budgetBucket(totalBudget, travelers) {
  const perPerson = travelers > 0 ? totalBudget / travelers : totalBudget;
  if (perPerson < 4000) return "budget";
  if (perPerson < 9000) return "mid-range";
  return "premium";
}

function monthlyWindow(tripRequest) {
  const month = tripRequest.travel_month;
  if (typeof month === "number") return month;

  for (const raw of [
    tripRequest.departure_date || "",
    tripRequest.date_flexibility || "",
    tripRequest.travel_month_text || "",
  ]) {
    if (!raw) continue;
    try {
      return Number.parseInt(String(raw).slice(5, 7), 10);
    } catch {
      continue;
    }
  }
  return 0;
}

function buildXinjiangRoutes(tripRequest) {
  const duration = Number.parseInt(String(tripRequest.duration_days || 7), 10);
  const month = monthlyWindow(tripRequest);
  const pace = tripRequest.pace_preference || "moderate";
  const travelers = Number.parseInt(String(tripRequest.travelers || 2), 10);
  const budgetTotal = Number.parseFloat(String(tripRequest.budget?.total || 0));
  const budgetBucketVal = budgetTotal ? budgetBucket(budgetTotal, travelers) : "mid-range";
  const transport = (tripRequest.transport_preferences || []).join(" ");
  const interests = [
    ...(tripRequest.activities || []).map(String),
    ...(tripRequest.interests || []).map(String),
  ];
  const companions = String(tripRequest.travel_companions || "");

  const canSelfDrive = transport.includes("self-drive") || transport.includes("自驾");
  const prefersRelaxed = pace === "relaxed" || companions.includes("family") || companions.includes("elder");
  const likesNature = containsAny(interests, ["nature", "outdoor", "landscape", "摄影", "风景", "自然", "草原"]);
  const likesCulture = containsAny(interests, ["culture", "history", "food", "美食", "人文", "历史"]);

  const routes = [
    {
      route_id: "xinjiang-yili-soft-loop",
      title: "North Xinjiang Yili soft route",
      summary:
        "Best for first-time 7-day trips focused on grasslands, lakes, and a smoother pace.",
      style: "nature-relaxed",
      regions: ["Urumqi", "Sailimu Lake", "Yining", "Nalati or Tekes"],
      arrival_hubs: ["Urumqi", "Yining"],
      departure_hubs: ["Yining", "Urumqi"],
      hotel_bases: ["Urumqi", "Yining", "Nalati or Tekes"],
      poi_cities: ["Urumqi", "Yining"],
      validation_focus: [
        "Check whether open-jaw flights beat round-trip pricing.",
        "Validate Yining-area hotel supply before locking the route.",
        "Confirm lake and grassland day-trip transport time from the hotel base.",
      ],
      suggested_transport: "Flight plus local driver or small-group car service",
      stay_strategy: "3 bases max to reduce hotel changes",
      why_it_works: [
        "High scenery density within a 7-day window",
        "More forgiving than forcing both Yili and Kanas",
        "Works well for first-time visitors who do not want to self-drive",
      ],
      tradeoffs: ["Peak summer pricing can spike quickly", "A few road segments are still long"],
      score: 72,
      reasons: [],
      risks: [],
    },
    {
      route_id: "xinjiang-kanas-scenic-line",
      title: "North Xinjiang Kanas scenic line",
      summary: "Best for travelers prioritizing iconic alpine scenery and strong photo payoff.",
      style: "nature-photography",
      regions: ["Urumqi", "Burqin", "Kanas", "Hemu"],
      arrival_hubs: ["Urumqi", "Altay"],
      departure_hubs: ["Altay", "Urumqi"],
      hotel_bases: ["Burqin", "Kanas", "Hemu"],
      poi_cities: ["Altay", "Burqin"],
      validation_focus: [
        "Validate whether charter transport is required for comfort.",
        "Check if hotel prices near Kanas/Hemu have already spiked.",
        "Confirm that the total transfer burden still fits a 7-day trip.",
      ],
      suggested_transport: "Flight plus charter / self-drive for best control",
      stay_strategy: "Expect more transfers and early starts",
      why_it_works: [
        "Stronger iconic scenery if Kanas is the primary dream",
        "Excellent in early autumn for color and photography",
      ],
      tradeoffs: ["Longer transfers and higher fatigue", "Less friendly for a relaxed first trip"],
      score: 64,
      reasons: [],
      risks: [],
    },
    {
      route_id: "xinjiang-southern-culture-line",
      title: "Southern Xinjiang culture line",
      summary: "Best for food, city texture, markets, and stronger cultural immersion.",
      style: "culture-food",
      regions: ["Urumqi", "Kashgar", "old city neighborhoods", "markets"],
      arrival_hubs: ["Urumqi", "Kashgar"],
      departure_hubs: ["Kashgar", "Urumqi"],
      hotel_bases: ["Kashgar", "Urumqi"],
      poi_cities: ["Kashgar", "Urumqi"],
      validation_focus: [
        "Check internal flight timing and whether one overnight transfer can be avoided.",
        "Validate old-town-adjacent hotel zones for walkability.",
        "Check key market / old-city opening patterns before assigning days.",
      ],
      suggested_transport: "Flight between anchor cities plus short urban transfers",
      stay_strategy: "2 city bases with lighter daily movement",
      why_it_works: ["Better fit for culture-first travelers", "More manageable without self-driving"],
      tradeoffs: [
        "Less pure landscape intensity than Yili or Kanas",
        "Not ideal if the user's dream is classic northern scenery",
      ],
      score: 58,
      reasons: [],
      risks: [],
    },
    {
      route_id: "xinjiang-urumqi-light",
      title: "Urumqi plus nearby easy route",
      summary: "Best for short, lower-energy, or family-friendly trips with minimal logistics stress.",
      style: "easy-family",
      regions: ["Urumqi", "nearby day trips", "one secondary base at most"],
      arrival_hubs: ["Urumqi"],
      departure_hubs: ["Urumqi"],
      hotel_bases: ["Urumqi"],
      poi_cities: ["Urumqi"],
      validation_focus: [
        "Check whether a single Urumqi hotel base keeps every day trip realistic.",
        "Validate transfer times from the airport and railway station.",
        "Use nearby search to find lower-friction family dinner options.",
      ],
      suggested_transport: "Round-trip flight to Urumqi plus short transfers",
      stay_strategy: "1-2 hotel bases only",
      why_it_works: [
        "Reduces fatigue and hotel switching",
        "Good fallback when time, energy, or budget is tighter",
      ],
      tradeoffs: [
        "Less ambitious and less scenic range",
        "Can feel too conservative for high-energy travelers",
      ],
      score: 52,
      reasons: [],
      risks: [],
    },
  ];

  for (const route of routes) {
    if (duration <= 6 && ["xinjiang-yili-soft-loop", "xinjiang-kanas-scenic-line"].includes(route.route_id)) {
      route.score -= 8;
      route.reasons.push("Tighter trip length favors simpler routing.");
    }

    if (duration >= 7 && route.route_id === "xinjiang-yili-soft-loop") {
      route.score += 6;
      route.reasons.push("Seven days is a strong fit for a softer Yili line.");
    }

    if (likesNature && ["nature-relaxed", "nature-photography"].includes(route.style)) {
      route.score += 10;
      route.reasons.push("Matches the user's nature and scenery interests.");
    }

    if (likesCulture && route.style === "culture-food") {
      route.score += 12;
      route.reasons.push("Matches the user's culture and food priorities.");
    }

    if (!canSelfDrive && route.route_id === "xinjiang-kanas-scenic-line") {
      route.score -= 10;
      route.risks.push("Harder to execute comfortably without self-driving or chartering.");
    }

    if (prefersRelaxed && route.route_id === "xinjiang-urumqi-light") {
      route.score += 10;
      route.reasons.push("Lower-pressure routing fits a relaxed or family trip.");
    }

    if (prefersRelaxed && route.route_id === "xinjiang-kanas-scenic-line") {
      route.score -= 8;
      route.risks.push("Transfer intensity may feel too heavy for this pace.");
    }

    if (budgetBucketVal === "budget" && route.route_id === "xinjiang-kanas-scenic-line") {
      route.score -= 6;
      route.risks.push("Peak-route costs may outrun a tight budget.");
    }

    if (
      budgetBucketVal === "premium" &&
      ["xinjiang-yili-soft-loop", "xinjiang-kanas-scenic-line"].includes(route.route_id)
    ) {
      route.score += 4;
      route.reasons.push("Budget can support better transport and lodging decisions.");
    }

    if (month >= 6 && month <= 8 && route.route_id === "xinjiang-yili-soft-loop") {
      route.score += 8;
      route.reasons.push("High summer strongly favors grassland and lake scenery.");
    }

    if ((month === 9 || month === 10) && route.route_id === "xinjiang-kanas-scenic-line") {
      route.score += 8;
      route.reasons.push("Autumn timing is especially strong for Kanas/Hemu.");
    }

    if ([12, 1, 2].includes(month) && route.style !== "culture-food") {
      route.score -= 8;
      route.risks.push("Winter conditions may weaken this route for a general traveler.");
    }
  }

  return routes.sort((a, b) => b.score - a.score);
}

function buildGenericRoutes(tripRequest) {
  const duration = Number.parseInt(String(tripRequest.duration_days || 7), 10);
  const pace = tripRequest.pace_preference || "moderate";
  const transport = (tripRequest.transport_preferences || []).join(" ");

  const routes = [
    {
      route_id: "generic-single-base",
      title: "Single-base route",
      summary: "Stay in one main area and use day trips to reduce transit friction.",
      score: 60,
      why_it_works: ["Best default for shorter trips or slower travel pace."],
      tradeoffs: ["You may see fewer regions overall."],
      arrival_hubs: [],
      departure_hubs: [],
      hotel_bases: [],
      poi_cities: [],
      validation_focus: ["Validate that the chosen hotel zone supports most planned days."],
    },
    {
      route_id: "generic-two-base",
      title: "Two-base route",
      summary: "Split the trip across two anchor areas for better variety.",
      score: 58,
      why_it_works: ["Good balance between range and comfort for a weeklong trip."],
      tradeoffs: ["Requires at least one hotel move."],
      arrival_hubs: [],
      departure_hubs: [],
      hotel_bases: [],
      poi_cities: [],
      validation_focus: ["Validate that the hotel move saves enough time to justify itself."],
    },
  ];

  if (duration <= 5 || pace === "relaxed") routes[0].score += 8;
  if (duration >= 7 && transport.includes("self-drive")) routes[1].score += 6;

  return routes.sort((a, b) => b.score - a.score);
}

export function selectRouteCandidates(tripRequest) {
  const key = destinationKey(tripRequest);
  const ranked = key === "xinjiang" ? buildXinjiangRoutes(tripRequest) : buildGenericRoutes(tripRequest);

  const recommended = ranked[0] ?? null;
  const alternatives = ranked.slice(1, 3);
  const rejected = ranked
    .slice(3)
    .filter((route) => (route.score || 0) < ((recommended?.score || 0) - 8));

  return {
    destination_key: key,
    recommended_route: recommended,
    alternatives,
    rejected_routes: rejected,
    planning_note:
      "Use this framing result before you spend effort on a detailed itinerary. " +
      "Confirm the route family, lodging strategy, and transport style first.",
  };
}

function printRouteSelectorHelp() {
  console.log(`route_selector.mjs — score route candidates before a full itinerary

Usage:
  node route_selector.mjs --input '<trip_request_json>'

Example:
  node route_selector.mjs --input '{"destination":{"region":"Xinjiang"},"duration_days":7}'
`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printRouteSelectorHelp();
    process.exit(0);
  }
  const inputIdx = argv.indexOf("--input");
  if (inputIdx < 0 || !argv[inputIdx + 1]) {
    console.error("Error: --input is required (use --help for usage)");
    process.exit(1);
  }
  const payload = JSON.parse(argv[inputIdx + 1]);
  console.log(JSON.stringify(selectRouteCandidates(payload), null, 2));
}
