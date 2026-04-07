/**
 * Pre-trip and daily brief generation (Node port of briefing.py)
 */

import { fileURLToPath } from "node:url";

import {
  assertOnlyFlags,
  isCliHelp,
  parseCliArgs,
  readJsonFromCliValue,
  requireFlag,
} from "./cli_args.mjs";

function parseDate(value) {
  if (!value) return null;
  const d = Date.parse(value);
  return Number.isNaN(d) ? null : new Date(d);
}

function daysUntilDeparture(tripData) {
  const departure = parseDate(tripData.departure_date || "");
  if (!departure) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dep = new Date(departure);
  dep.setHours(0, 0, 0, 0);
  return Math.round((dep - today) / 86400000);
}

function tripName(tripData) {
  const destination = tripData.destination || {};
  return (
    destination.city ||
    destination.region ||
    destination.country ||
    tripData.destination_text ||
    "your trip"
  );
}

function firstDayCard(plan) {
  const itinerary = plan.itinerary || [];
  return itinerary[0] || {};
}

export function buildPreTripBrief(tripData, plan) {
  const daysUntil = daysUntilDeparture(tripData);
  const bookingReady = plan.booking_ready || {};
  const confirmed = tripData.confirmed_bookings || {};
  const firstDay = firstDayCard(plan);

  const tasks = [];
  if (bookingReady.status !== "ready") {
    tasks.push("Finish validating transport and hotel choices before locking the final itinerary.");
  }
  if (!confirmed.flight) tasks.push("Choose and confirm the main flight or rail option.");
  if (!confirmed.hotel) tasks.push("Confirm the first hotel base and save the booking details.");

  const preTripLists = plan.pre_trip_checklist || [];
  const lastBlock = preTripLists[preTripLists.length - 1] || {};
  const extraTasks = (lastBlock.tasks || []).slice(0, 3);
  tasks.push(...extraTasks);

  const name = tripName(tripData);
  return {
    type: "pre_trip",
    trip_name: name,
    days_until_departure: daysUntil,
    headline:
      daysUntil != null
        ? `${name} departs in ${daysUntil} days.`
        : `Pre-trip brief for ${name}.`,
    must_handle_next: tasks.slice(0, 5),
    booking_status: bookingReady.status || "",
    confirmed_bookings: confirmed,
    first_day_preview: {
      theme: firstDay.theme || "",
      primary_goal: firstDay.primary_goal || "",
    },
  };
}

export function buildDailyBrief(tripData, plan, dayIndex = 1) {
  const itinerary = plan.itinerary || [];
  if (!itinerary.length) {
    return {
      type: "daily_brief",
      headline: `No itinerary available yet for ${tripName(tripData)}.`,
      items: [],
    };
  }

  const idx = Math.max(1, dayIndex) - 1;
  const dayCard = itinerary[Math.min(idx, itinerary.length - 1)];
  const bookingReady = plan.booking_ready || {};
  const hotelChoice =
    (tripData.confirmed_bookings || {}).hotel || {};

  const items = [
    `Primary goal: ${dayCard.primary_goal || ""}`,
    `Transit strategy: ${dayCard.transit_strategy || ""}`,
    `Weather backup: ${dayCard.weather_backup || ""}`,
  ];

  if (dayCard.arrival_transport) {
    const transport = dayCard.arrival_transport;
    items.push(
      `Arrival transport: ${transport.origin || ""} -> ${transport.destination || ""} ${transport.departure || ""}`.trim(),
    );
  }

  if (hotelChoice.name) items.push(`Hotel base: ${hotelChoice.name}`);
  else if ((dayCard.lodging || {}).name) items.push(`Hotel base: ${dayCard.lodging.name}`);

  if (bookingReady.anchor_pois?.length) {
    items.push(`Anchor POI to protect: ${bookingReady.anchor_pois[0].name || ""}`);
  } else if ((dayCard.anchor_poi || {}).name) {
    items.push(`Anchor POI to protect: ${dayCard.anchor_poi.name}`);
  }

  const name = tripName(tripData);
  return {
    type: "daily_brief",
    trip_name: name,
    day: dayCard.day || dayIndex,
    date: dayCard.date || "",
    headline: `Day ${dayCard.day || dayIndex} brief for ${name}`,
    theme: dayCard.theme || "",
    items,
    time_anchors: dayCard.time_anchors || [],
    meal_strategy: dayCard.meal_strategy || {},
    booking_watchouts: dayCard.booking_watchouts || [],
  };
}

function printBriefingHelp() {
  console.log(`briefing.mjs — pre-trip or daily brief JSON

All flags use --key=value. JSON may be inline or @path.

Usage:
  node briefing.mjs --mode=pre_trip|daily --trip=<json|@file> --plan=<json|@file> [--day=<N>]

Options:
  --mode   Required. pre_trip or daily.
  --trip   Required. Trip object.
  --plan   Required. Plan object.
  --day    For daily mode; 1-based day index (default 1).
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printBriefingHelp();
    process.exit(0);
  }
  const args = parseCliArgs(argv);
  assertOnlyFlags(args, ["mode", "trip", "plan", "day"]);
  requireFlag(args, "mode");
  requireFlag(args, "trip");
  requireFlag(args, "plan");
  const mode = args.mode;
  const trip = readJsonFromCliValue("trip", args.trip, undefined);
  const plan = readJsonFromCliValue("plan", args.plan, undefined);
  const dayRaw = args.day !== undefined && args.day !== "" ? args.day : "1";
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(day)) {
    console.error("Error: --day must be a number");
    process.exit(1);
  }
  const result = mode === "pre_trip" ? buildPreTripBrief(trip, plan) : buildDailyBrief(trip, plan, day);
  console.log(JSON.stringify(result, null, 2));
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
