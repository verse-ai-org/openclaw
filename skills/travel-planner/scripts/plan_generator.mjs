/**
 * Travel Plan Generator (Node port of plan_generator.py)
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { isCliHelp } from "./cli-help.mjs";

import { buildBookingReadyPackage } from "./booking_ready.mjs";
import { buildDailyBrief, buildPreTripBrief } from "./briefing.mjs";
import { buildLiveValidation } from "./live_validation.mjs";
import { selectRouteCandidates } from "./route_selector.mjs";
import { getPreferences, getTripById } from "./travel_db.mjs";

function pyStripChars(str, chars) {
  const charSet = new Set([...chars]);
  let start = 0;
  let end = str.length;
  while (start < end && charSet.has(str[start])) start++;
  while (end > start && charSet.has(str[end - 1])) end--;
  return str.slice(start, end);
}

export function inferTripStage(tripData) {
  if (tripData.stage) return tripData.stage;
  if (tripData.during_trip) return "in_trip";
  if (tripData.bookings_confirmed) return "ready_to_book";
  if (tripData.selected_route && Object.keys(tripData.selected_route).length) return "plan_ready";
  if (tripData.route_candidates?.length) return "route_framing";
  return "intake";
}

function dateForDay(departureDate, dayOffset) {
  if (!departureDate) return "";
  const start = Date.parse(departureDate);
  if (Number.isNaN(start)) return "";
  const d = new Date(start);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function activityDensity(pace) {
  if (pace === "relaxed") return "1 anchor activity + 1 optional stop";
  if (pace === "packed") return "2 anchor activities + 1 evening option";
  return "1 anchor activity + 1 secondary area";
}

export function generateRouteFraming(tripData, preferences) {
  const request = {
    ...tripData,
    interests: tripData.interests ?? preferences.interests ?? [],
    pace_preference: tripData.pace_preference ?? preferences.pace_preference ?? "moderate",
    travel_companions: tripData.travel_companions ?? preferences.travel_companions ?? "",
    transport_preferences:
      tripData.transport_preferences?.length ? tripData.transport_preferences : preferences.transport_preferences || [],
  };

  const framing = selectRouteCandidates(request);
  const recommended = framing.recommended_route || {};

  return {
    stage: "route_framing",
    recommended_route: recommended,
    alternatives: framing.alternatives || [],
    rejected_routes: framing.rejected_routes || [],
    decision_summary: {
      headline: recommended.title || "Confirm the route before building the itinerary.",
      why_now: "A better route choice usually matters more than squeezing in more attractions.",
      planning_note: framing.planning_note || "",
    },
  };
}

export function generatePlanSkeleton(tripData, preferences) {
  const destination = tripData.destination || {};
  const route =
    tripData.selected_route ||
    generateRouteFraming(tripData, preferences).recommended_route ||
    {};
  const travelers = tripData.travelers || 2;
  const duration = tripData.duration_days || 7;
  const budgetTotal = tripData.budget?.total || 0;

  return {
    headline: `${duration}-day trip skeleton for ${destination.city || destination.region || destination.country || "your destination"}`,
    route_title: route.title || "Recommended route",
    route_summary: route.summary || "",
    stay_strategy: route.stay_strategy || "Keep hotel changes minimal until the route is confirmed.",
    transport_strategy:
      route.suggested_transport ||
      "Decide the anchor cities and main transport mode before booking day-to-day details.",
    budget_snapshot: {
      total: budgetTotal,
      travelers,
      daily_average: duration && budgetTotal ? Math.round((budgetTotal / duration) * 100) / 100 : 0,
    },
    questions_to_confirm: [
      "Does this route family match the trip you imagined?",
      "Do you want lower friction or stronger scenery payoff?",
      "Should we optimize around budget, comfort, or must-see stops?",
    ],
    approval_rule: "Only move into a booking-ready plan after transport and hotel validation are complete.",
  };
}

export function generateDailyItinerary(destination, tripData, interests, pace = "moderate") {
  const itinerary = [];
  const numDays = Number.parseInt(String(tripData.duration_days || 7), 10);
  const departureDate = tripData.departure_date || "";
  const route = tripData.selected_route || {};
  const destinationName =
    destination.city || destination.region || destination.country || "destination";

  for (let day = 1; day <= numDays; day++) {
    const isArrivalDay = day === 1;
    const isDepartureDay = day === numDays;
    const dateValue = dateForDay(departureDate, day - 1);
    const anchorType = isArrivalDay ? "arrival" : isDepartureDay ? "departure" : "core-exploration";
    const energyLoad =
      isArrivalDay || isDepartureDay ? "light" : pace === "moderate" ? "moderate" : pace;

    itinerary.push({
      day,
      date: dateValue,
      theme: isArrivalDay
        ? "Arrival and settling in"
        : isDepartureDay
          ? "Departure and last-mile buffer"
          : `${destinationName} exploration block`,
      primary_goal: isArrivalDay
        ? "Land smoothly, check in, and keep the first day forgiving."
        : isDepartureDay
          ? "Protect departure logistics and keep only low-risk final stops."
          : `Build around one anchor experience tied to ${interests.slice(0, 2).join(", ") || "the main route"}.`,
      secondary_goal: isArrivalDay
        ? "Short neighborhood walk plus an easy first meal."
        : isDepartureDay
          ? "One compact final activity near the hotel or station."
          : "One optional nearby stop if energy, weather, and queues all look good.",
      route_context: route.title || "",
      anchor_type: anchorType,
      time_anchors: [
        {
          window: "Morning",
          focus: isArrivalDay ? "Arrival / transfer buffer" : "Anchor activity window",
          notes: "Book the fixed-time item here once transport is confirmed.",
        },
        {
          window: "Afternoon",
          focus: "Core exploration area",
          notes: "Group nearby stops to avoid zig-zag routing.",
        },
        {
          window: "Evening",
          focus: "Dinner and low-risk optional stop",
          notes: "Keep this optional on tired or weather-affected days.",
        },
      ],
      activity_density: activityDensity(pace),
      transit_strategy: isArrivalDay
        ? "Prioritize the least stressful airport/station-to-hotel chain."
        : isDepartureDay
          ? "Work backwards from the departure cutoff and avoid remote detours."
          : "Choose one geographic cluster and protect 20-30% buffer time.",
      meal_strategy: {
        breakfast: "Hotel or nearby low-friction cafe",
        lunch: "Near the anchor activity",
        dinner: "In the evening neighborhood, ideally reservation-backed if popular",
      },
      energy_load: energyLoad,
      estimated_cost_band: "medium",
      booking_watchouts: [
        "Anchor attractions with timed entry should be booked before smaller add-ons.",
        "Arrival and departure days should not depend on tight transfer windows.",
      ],
      weather_backup: "Swap to an indoor or lower-mobility option in the same area.",
      notes: [
        "This day card is a structure, not the final attraction list.",
        "Add exact POIs only after hotel zone and main transport are locked.",
      ],
    });
  }
  return itinerary;
}

export function hydrateItineraryWithBookingReady(itinerary, bookingReady, confirmedBookings) {
  if (!itinerary?.length) return itinerary;

  const chosenTransport =
    confirmedBookings.flight || confirmedBookings.train || bookingReady.chosen_transport || {};
  const chosenHotel = confirmedBookings.hotel || bookingReady.chosen_hotel || {};
  const chosenAnchorPoi = bookingReady.chosen_anchor_poi || {};

  return itinerary.map((day, index) => {
    const nextDay = { ...day };
    nextDay.lodging = {
      name: chosenHotel.name || "",
      address: chosenHotel.address || "",
      price: chosenHotel.price || "",
      area_note: chosenHotel.area_note || "",
      booking_link: chosenHotel.booking_link || "",
    };

    if (index === 0 && Object.keys(chosenTransport).length) {
      nextDay.arrival_transport = chosenTransport;
      const focus = pyStripChars(
        `${chosenTransport.origin || ""} -> ${chosenTransport.destination || ""}`,
        " ->",
      );
      nextDay.time_anchors = [
        ...(nextDay.time_anchors || []),
        {
          window: "Arrival",
          focus,
          notes: chosenTransport.departure || chosenTransport.duration || "",
        },
      ];
    }

    if (index === 1 && Object.keys(chosenAnchorPoi).length) {
      nextDay.anchor_poi = chosenAnchorPoi;
      nextDay.primary_goal = `Protect the anchor experience at ${chosenAnchorPoi.name || "the main highlight"}.`;
      nextDay.notes = [
        ...(nextDay.notes || []),
        `Anchor POI selected from live results: ${chosenAnchorPoi.name || ""}.`,
      ];
    }

    if (chosenHotel.name) {
      nextDay.notes = [
        ...(nextDay.notes || []),
        `Hotel base currently chosen: ${chosenHotel.name}.`,
      ];
    }

    return nextDay;
  });
}

export function calculateBudgetBreakdown(totalBudget, numDays, accommodationLevel = "mid-range") {
  const allocations = {
    budget: {
      accommodation: 0.38,
      food: 0.24,
      activities: 0.18,
      transportation: 0.14,
      miscellaneous: 0.06,
    },
    "mid-range": {
      accommodation: 0.35,
      food: 0.24,
      activities: 0.22,
      transportation: 0.13,
      miscellaneous: 0.06,
    },
    luxury: {
      accommodation: 0.43,
      food: 0.2,
      activities: 0.18,
      transportation: 0.13,
      miscellaneous: 0.06,
    },
  };

  const allocation = allocations[accommodationLevel] || allocations["mid-range"];
  const breakdown = {};
  for (const [category, percentage] of Object.entries(allocation)) {
    const amount = totalBudget * percentage;
    const perDay = numDays > 0 ? amount / numDays : 0;
    breakdown[category] = {
      total: Math.round(amount * 100) / 100,
      per_day: Math.round(perDay * 100) / 100,
      percentage: percentage * 100,
    };
  }

  return {
    total_budget: totalBudget,
    duration_days: numDays,
    breakdown,
    daily_average: numDays > 0 ? Math.round((totalBudget / numDays) * 100) / 100 : 0,
    guidance: [
      "Use route choice and hotel zone to pressure-test this budget.",
      "Protect a 10-15% buffer before booking optional experiences.",
    ],
  };
}

export function generatePackingChecklist(destinationClimate, durationDays, tripActivities) {
  const checklist = {
    essentials: [
      "Passport",
      "Visa (if required)",
      "Travel insurance documents",
      "Flight tickets/boarding passes",
      "Hotel confirmations",
      "Credit/debit cards",
      "Local currency",
      "Phone and charger",
      "Adapter/converter (if needed)",
      "Medications (prescription and basic)",
      "Copies of important documents",
    ],
    clothing: [],
    toiletries: [
      "Toothbrush and toothpaste",
      "Shampoo and soap",
      "Deodorant",
      "Sunscreen",
      "Any personal care items",
    ],
    technology: [
      "Phone charger",
      "Power bank",
      "Camera (if bringing)",
      "Headphones",
      "Laptop/tablet (if needed)",
    ],
    activities: [],
  };

  const climate = String(destinationClimate).toLowerCase();
  if (climate.includes("tropical") || climate.includes("warm")) {
    checklist.clothing.push(
      "Lightweight, breathable clothes",
      "Shorts and t-shirts",
      "Sundress/summer clothes",
      "Swimsuit",
      "Sun hat",
      "Sunglasses",
      "Sandals/flip-flops",
    );
  } else if (climate.includes("cold") || climate.includes("winter")) {
    checklist.clothing.push(
      "Warm jacket/coat",
      "Sweaters/hoodies",
      "Long pants",
      "Thermal underwear",
      "Warm socks",
      "Gloves and scarf",
      "Winter boots",
    );
  } else {
    checklist.clothing.push(
      "Mix of light and warm layers",
      "T-shirts and long-sleeve shirts",
      "Pants and shorts",
      "Light jacket",
      "Comfortable walking shoes",
      "Sneakers",
    );
  }

  const activityItems = {
    hiking: ["Hiking boots", "Backpack", "Water bottle", "Trail snacks"],
    beach: ["Swimsuit", "Beach towel", "Snorkel gear", "Waterproof bag"],
    formal: ["Dress clothes", "Dress shoes", "Nice accessories"],
    adventure: ["Athletic wear", "Action camera", "First aid kit"],
    business: ["Business attire", "Laptop", "Business cards", "Portfolio"],
    roadtrip: ["Motion sickness kit", "Offline maps", "Portable charger"],
  };

  for (const activity of tripActivities) {
    const activityLower = String(activity).toLowerCase();
    for (const [key, items] of Object.entries(activityItems)) {
      if (activityLower.includes(key)) checklist.activities.push(...items);
    }
  }

  for (const category of Object.keys(checklist)) {
    checklist[category] = [...new Set(checklist[category])].sort();
  }

  checklist.essentials.push(
    `Enough clothes planning for roughly ${Math.min(durationDays, 7)} days before laundry.`,
  );
  return checklist;
}

export function generatePreTripChecklist(_destinationCountry, departureDate) {
  let departure;
  try {
    departure = new Date(departureDate);
    if (Number.isNaN(departure.getTime())) throw new Error("invalid");
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    departure = d;
  }

  const today = new Date();
  const daysUntil = Math.floor((departure - today) / 86400000);
  const checklist = [];

  if (daysUntil >= 90) {
    checklist.push({
      timeline: "3 months before",
      tasks: [
        "Research destination and create wish list",
        "Check passport expiration (needs 6+ months validity)",
        "Research visa requirements",
        "Set up travel alerts for flights",
        "Start saving/budgeting for trip",
      ],
    });
  }
  if (daysUntil >= 60) {
    checklist.push({
      timeline: "2 months before",
      tasks: [
        "Book flights",
        "Book accommodation",
        "Apply for visa if needed",
        "Purchase travel insurance",
        "Check vaccination requirements",
        "Research local customs and etiquette",
      ],
    });
  }
  if (daysUntil >= 30) {
    checklist.push({
      timeline: "1 month before",
      tasks: [
        "Book major activities and tours",
        "Notify bank of travel dates",
        "Set up international phone plan",
        "Make restaurant reservations",
        "Check weather forecasts",
        "Start gathering packing items",
      ],
    });
  }
  if (daysUntil >= 14) {
    checklist.push({
      timeline: "2 weeks before",
      tasks: [
        "Confirm all reservations",
        "Print important documents",
        "Exchange some currency",
        "Refill prescriptions",
        "Arrange pet/plant care",
        "Hold mail delivery",
      ],
    });
  }
  if (daysUntil >= 7) {
    checklist.push({
      timeline: "1 week before",
      tasks: [
        "Check in for flights",
        "Download offline maps",
        "Pack luggage",
        "Charge all devices",
        "Clean out refrigerator",
        "Set up home security",
      ],
    });
  }

  checklist.push({
    timeline: "Day before departure",
    tasks: [
      "Re-check flight times",
      "Prepare carry-on essentials",
      "Take out trash",
      "Check weather at destination",
      "Get good rest",
      "Set multiple alarms",
    ],
  });

  return checklist;
}

function hasToolPlan(liveValidation) {
  const tp = liveValidation?.tool_plan;
  if (!tp || typeof tp !== "object") return false;
  return Object.keys(tp).length > 0;
}

export function generateTripPlan(tripData) {
  const destination = tripData.destination || {};
  const duration = Number.parseInt(String(tripData.duration_days || 7), 10);
  const budget = Number.parseFloat(String(tripData.budget?.total || 0));
  const departureDate = tripData.departure_date || "";
  const preferences = getPreferences();
  const stage = inferTripStage(tripData);

  const interests = tripData.interests || preferences.interests || [];
  const pace = tripData.pace_preference || preferences.pace_preference || "moderate";
  const accommodationLevel = preferences.budget_level || "mid-range";

  const routeFraming = generateRouteFraming(tripData, preferences);
  const selectedRoute = tripData.selected_route || routeFraming.recommended_route || {};
  const skeleton = generatePlanSkeleton({ ...tripData, selected_route: selectedRoute }, preferences);
  const liveValidation = buildLiveValidation(tripData, selectedRoute, preferences);
  const liveResults = tripData.live_results || {};
  const bookingReady = buildBookingReadyPackage(tripData, selectedRoute, liveValidation, liveResults);

  const bookingStrategy = {
    status:
      bookingReady.status === "ready"
        ? "booking_ready"
        : hasToolPlan(liveValidation)
          ? "needs_live_validation"
          : "route_only",
    next_actions: [
      "Validate transport options with live flight or rail search.",
      "Validate hotel bases before assigning exact daily anchors.",
      "Promote to booking-ready response after the decision gates are met.",
      "Synthesize live results into final transport and hotel picks.",
    ],
    decision_gates: liveValidation.decision_gates,
  };

  const baseItinerary = generateDailyItinerary(
    destination,
    { ...tripData, selected_route: selectedRoute },
    interests,
    pace,
  );
  const confirmedBookings = tripData.confirmed_bookings || {};
  const hydratedItinerary = hydrateItineraryWithBookingReady(
    baseItinerary,
    bookingReady,
    confirmedBookings,
  );

  const serviceState = {
    stage: tripData.during_trip
      ? "in_trip"
      : tripData.bookings_confirmed || bookingReady.status === "ready"
        ? "pre_trip"
        : "planning",
    ready_for_pre_trip_brief: bookingReady.status === "ready",
    ready_for_daily_brief: Boolean(tripData.during_trip),
  };

  const plan = {
    trip_id: tripData.id || "",
    stage,
    destination,
    dates: {
      departure: departureDate,
      return: tripData.return_date || "",
      duration_days: duration,
    },
    route_framing: routeFraming,
    live_validation: liveValidation,
    plan_skeleton: skeleton,
    selected_route: selectedRoute,
    booking_strategy: bookingStrategy,
    booking_ready: bookingReady,
    service_state: serviceState,
    trip_brief: {
      planning_focus:
        "Confirm the route, validate transport and lodging, then synthesize the booking-ready decision package.",
      response_order: [
        "recommendation",
        "live_transport_and_hotel_validation",
        "booking_ready_transport_and_hotel_options",
        "transport_and_hotel_strategy",
        "day_by_day",
        "budget",
        "pre_trip_actions",
      ],
    },
    itinerary: hydratedItinerary,
    budget: calculateBudgetBreakdown(budget, duration, accommodationLevel),
    packing_checklist: generatePackingChecklist(
      tripData.climate || "moderate",
      duration,
      tripData.activities || [],
    ),
    pre_trip_checklist: generatePreTripChecklist(destination.country || "", departureDate),
    generated_at: new Date().toISOString(),
  };

  plan.pre_trip_brief = buildPreTripBrief(tripData, plan);
  plan.daily_brief_preview = buildDailyBrief(tripData, plan, 1);
  return plan;
}

function printPlanGeneratorHelp() {
  console.log(`plan_generator.mjs — full structured trip plan JSON

Usage:
  node plan_generator.mjs --trip-json '<trip_json>' [--output <file>]
  node plan_generator.mjs --trip-id <id> [--output <file>]

Options:
  --trip-json   Inline trip object (live_results / selected_route optional).
  --trip-id     Load trip from travel_db by id.
  --output      Write JSON to file instead of stdout.
`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printPlanGeneratorHelp();
    process.exit(0);
  }

  const tripJsonIdx = argv.indexOf("--trip-json");
  const tripIdIdx = argv.indexOf("--trip-id");
  const outIdx = argv.indexOf("--output");

  let trip;
  if (tripJsonIdx >= 0 && argv[tripJsonIdx + 1]) {
    trip = JSON.parse(argv[tripJsonIdx + 1]);
  } else if (tripIdIdx >= 0 && argv[tripIdIdx + 1]) {
    trip = getTripById(argv[tripIdIdx + 1]);
    if (!trip) {
      console.error(`Error: Trip ${argv[tripIdIdx + 1]} not found`);
      process.exit(1);
    }
  } else {
    console.error("Error: --trip-id or --trip-json required (use --help for usage)");
    process.exit(1);
  }

  const plan = generateTripPlan(trip);
  if (outIdx >= 0 && argv[outIdx + 1]) {
    fs.writeFileSync(argv[outIdx + 1], JSON.stringify(plan, null, 2), "utf8");
    console.log(`✓ Travel plan generated: ${argv[outIdx + 1]}`);
  } else {
    console.log(JSON.stringify(plan, null, 2));
  }
}
