/**
 * Turn validated live search results into a booking-ready travel package
 * (Node port of booking_ready.py)
 */

import { fileURLToPath } from "node:url";

import {
  assertOnlyFlags,
  isCliHelp,
  parseCliArgs,
  readJsonFromCliValue,
  requireFlag,
} from "./cli_args.mjs";

function firstList(payload) {
  const data = (payload || {}).data || {};
  return Array.isArray(data.itemList) ? data.itemList : [];
}

function cleanPrice(value) {
  if (value == null) return 0;
  const text = String(value).replace(/¥/g, "").replace(/,/g, "").trim();
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

function flightOption(item) {
  const journeys = item.journeys || [];
  const firstJourney = journeys[0] || {};
  const segments = firstJourney.segments || [];
  const firstSegment = segments[0] || {};
  const lastSegment = segments[segments.length - 1] || {};
  return {
    carrier: firstSegment.marketingTransportName || "",
    flight_no: firstSegment.marketingTransportNo || "",
    origin: firstSegment.depCityName || "",
    destination: lastSegment.arrCityName || "",
    departure: firstSegment.depDateTime || "",
    arrival: lastSegment.arrDateTime || "",
    duration: firstJourney.totalDuration || item.totalDuration || "",
    price: item.adultPrice || "",
    price_value: cleanPrice(item.adultPrice),
    booking_link: item.jumpUrl || "",
  };
}

function hotelOption(item) {
  return {
    name: item.name || "",
    brand: item.brandName || "",
    area_note: item.interestsPoi || "",
    address: item.address || "",
    star: item.star || "",
    score: item.score || "",
    score_desc: item.scoreDesc || "",
    review: item.review || "",
    price: item.price || "",
    price_value: cleanPrice(item.price),
    booking_link: item.detailUrl || "",
    image: item.mainPic || "",
  };
}

function poiOption(item) {
  const ticketInfo = item.ticketInfo || {};
  return {
    name: item.name || "",
    address: item.address || "",
    ticket_name: ticketInfo.ticketName || "",
    ticket_price: ticketInfo.price,
    booking_link: item.jumpUrl || "",
    image: item.mainPic || "",
  };
}

function trainOption(item) {
  return {
    train_code: item.trainCode || "",
    origin: item.fromStation || "",
    destination: item.toStation || "",
    departure: item.departTime || "",
    arrival: item.arriveTime || "",
    duration: item.duration || "",
    second_class: item.ze || "",
    first_class: item.zy || "",
  };
}

function topSorted(items, count, key, reverse = false) {
  return [...items]
    .sort((a, b) => {
      const av = a[key] || 0;
      const bv = b[key] || 0;
      return reverse ? bv - av : av - bv;
    })
    .slice(0, count);
}

export function buildBookingReadyPackage(tripData, selectedRoute, liveValidation, liveResults) {
  const flightItems = firstList(liveResults?.flights || {}).map(flightOption);
  const hotelItems = firstList(liveResults?.hotels || {}).map(hotelOption);
  const poiItems = firstList(liveResults?.pois || {}).map(poiOption);
  const trainItems = (liveResults?.transport?.trains || []).map(trainOption);

  const cheapestFlights = topSorted(flightItems, 3, "price_value");
  const topHotels = topSorted(hotelItems, 3, "price_value");
  const anchorPois = poiItems.slice(0, 3);
  const topTrains = trainItems.slice(0, 3);

  const hasTransport = cheapestFlights.length > 0 || topTrains.length > 0;
  const hasHotels = topHotels.length > 0;
  const readiness = hasTransport && hasHotels ? "ready" : "partial";

  const routeTitle = selectedRoute.title || "Recommended route";
  const routeSummary = selectedRoute.summary || "";

  const watchouts = [];
  if (!hasTransport) watchouts.push("No live transport results attached yet.");
  if (!hasHotels) watchouts.push("No live hotel results attached yet.");
  if (!anchorPois.length) watchouts.push("No live POI validation attached yet.");

  if (hasTransport) {
    const dests = new Set(
      cheapestFlights.filter((f) => f.destination).map((f) => f.destination),
    );
    if (dests.size > 1) watchouts.push("Multiple arrival hubs are still in contention; explain why one wins.");
  }

  if (hasHotels) {
    const expensiveHotels = topHotels.filter((h) => (h.price_value || 0) > 0);
    if (expensiveHotels.length) {
      const avgNightly =
        expensiveHotels.reduce((s, h) => s + h.price_value, 0) / expensiveHotels.length;
      watchouts.push(
        `Validated nightly price band is roughly ¥${avgNightly.toFixed(0)}; pressure-test against total budget.`,
      );
    }
  }

  return {
    status: readiness,
    summary: {
      route_title: routeTitle,
      route_summary: routeSummary,
      why_booking_ready:
        readiness === "ready"
          ? "Major route, transport, and lodging assumptions now have live validation support."
          : "The route is strong, but some live booking inputs are still missing.",
    },
    recommended_sections: [
      "transport options",
      "hotel options",
      "anchor attractions",
      "booking watchouts",
      "next decision",
    ],
    transport_options: cheapestFlights,
    rail_options: topTrains,
    hotel_options: topHotels,
    anchor_pois: anchorPois,
    chosen_transport: cheapestFlights[0] || topTrains[0] || {},
    chosen_hotel: topHotels[0] || {},
    chosen_anchor_poi: anchorPois[0] || {},
    booking_watchouts: [...watchouts, ...(liveValidation.priority_checks || [])],
    next_decision:
      readiness === "ready"
        ? "Choose the preferred flight pattern and hotel base, then lock the final day-by-day plan."
        : "Run the missing live checks before presenting the final booking-ready plan.",
    decision_gates: liveValidation.decision_gates || [],
  };
}

function printBookingReadyHelp() {
  console.log(`booking_ready.mjs — synthesize booking-ready package from live tool outputs

All flags use --key=value. JSON may be inline or @path.

Usage:
  node booking_ready.mjs --trip=<json|@file> --route=<json|@file> --validation=<json|@file> [--results=<json|@file>]

Options:
  --trip         Required. Trip object.
  --route        Required. Route object.
  --validation   Required. Live validation object.
  --results      Optional (default {}).
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printBookingReadyHelp();
    process.exit(0);
  }
  const args = parseCliArgs(argv);
  assertOnlyFlags(args, ["trip", "route", "validation", "results"]);
  requireFlag(args, "trip");
  requireFlag(args, "route");
  requireFlag(args, "validation");
  const trip = readJsonFromCliValue("trip", args.trip, undefined);
  const route = readJsonFromCliValue("route", args.route, undefined);
  const validation = readJsonFromCliValue("validation", args.validation, undefined);
  const results = readJsonFromCliValue("results", args.results, {});
  console.log(JSON.stringify(buildBookingReadyPackage(trip, route, validation, results), null, 2));
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
