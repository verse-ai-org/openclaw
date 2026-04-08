import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function toNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function firstArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function firstList(payload) {
  if (Array.isArray(payload)) return payload;
  const root = payload || {};
  const data = root.data || {};
  return firstArray(
    data.itemList,
    data.items,
    data.list,
    root.itemList,
    root.items,
    root.list,
    root.results,
  );
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
    booking_link: toNonEmptyString(item.jumpUrl, item.jump_url, item.url, item.link),
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
    booking_link: toNonEmptyString(
      item.detailUrl,
      item.detail_url,
      item.jumpUrl,
      item.jump_url,
      item.hotelUrl,
      item.hotel_url,
      item.url,
      item.link,
    ),
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
    booking_link: toNonEmptyString(
      item.jumpUrl,
      item.jump_url,
      item.detailUrl,
      item.url,
      item.link,
    ),
    image: item.mainPic || "",
  };
}

function diningOption(item) {
  return {
    name: item.name || "",
    address: item.address || item.poiAddress || "",
    category: item.categoryName || item.tag || item.type || "",
    price: item.price || item.avgPrice || "",
    booking_link: toNonEmptyString(
      item.jumpUrl,
      item.jump_url,
      item.detailUrl,
      item.detail_url,
      item.url,
      item.link,
    ),
    image: item.mainPic || item.picUrl || "",
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
  const diningItems = firstArray(
    firstList(liveResults?.food || {}),
    firstList(liveResults?.dining || {}),
  ).map(diningOption);
  const trainItems = (liveResults?.transport?.trains || []).map(trainOption);

  const cheapestFlights = topSorted(flightItems, 3, "price_value");
  const topHotels = topSorted(hotelItems, 3, "price_value");
  const anchorPois = poiItems.slice(0, 3);
  const topDining = diningItems.slice(0, 3);
  const topTrains = trainItems.slice(0, 3);

  const hasTransportEvidence = cheapestFlights.length > 0 || topTrains.length > 0;
  const transportRequired = liveValidation?.transport_required !== false;
  const hasTransport = transportRequired ? hasTransportEvidence : true;
  const hasHotels = topHotels.length > 0;
  const hasDining = topDining.length > 0;
  // transport + hotels 满足即为 ready；dining 是加分项不作门限
  const readiness = hasTransport && hasHotels ? "ready" : "partial";

  const routeTitle = selectedRoute.title || "Recommended route";
  const routeSummary = selectedRoute.summary || "";

  const watchouts = [];
  if (!hasTransport && transportRequired) {
    watchouts.push("No live long-distance transport results attached yet.");
  }
  if (!hasHotels) watchouts.push("No live hotel results attached yet.");
  if (!hasDining) watchouts.push("No live dining results attached yet.");
  if (!anchorPois.length) watchouts.push("No live POI validation attached yet.");
  if (!transportRequired) {
    watchouts.push("Long-distance transport validation was skipped for this trip type.");
  }
  watchouts.push("Hotels are deferred for detailed day planning unless user asks to validate now.");

  if (hasTransport) {
    const dests = new Set(cheapestFlights.filter((f) => f.destination).map((f) => f.destination));
    if (dests.size > 1)
      watchouts.push("Multiple arrival hubs are still in contention; explain why one wins.");
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
          ? "Core feasibility checks (transport when needed + risk gating) are in a usable state."
          : "Core transport feasibility is still missing for a long-distance trip.",
    },
    recommended_sections: [
      "transport options",
      "hotel options",
      "dining options",
      "anchor attractions",
      "booking watchouts",
      "next decision",
    ],
    transport_options: cheapestFlights,
    rail_options: topTrains,
    hotel_options: topHotels,
    dining_options: topDining,
    anchor_pois: anchorPois,
    chosen_transport: cheapestFlights[0] || topTrains[0] || {},
    chosen_hotel: topHotels[0] || {},
    chosen_dining: topDining[0] || {},
    chosen_anchor_poi: anchorPois[0] || {},
    booking_watchouts: [...watchouts, ...(liveValidation.priority_checks || [])],
    next_decision:
      readiness === "ready"
        ? "Ask user to confirm light-validation result, then move to detailed day planning."
        : "Run missing live transport/hotel/dining checks before moving forward.",
    decision_gates: liveValidation.decision_gates || [],
  };
}

runScript({
  name: "booking-ready.mjs",
  description: "将实时搜索结果合并生成 booking-ready 行程包",
  usage:
    "node booking-ready.mjs --trip=<json|@file> --route=<json|@file> --validation=<json|@file> [--results=<json|@file>]",
  flags: [
    { name: "trip", desc: "行程对象 JSON 或 @文件路径" },
    { name: "route", desc: "路线对象 JSON 或 @文件路径" },
    { name: "validation", desc: "实时验证对象 JSON 或 @文件路径" },
    { name: "results", desc: "实时搜索结果 JSON 或 @文件路径（可选，默认 {}）" },
  ],
  required: ["trip", "route", "validation"],
  callerUrl: import.meta.url,
  run(args) {
    const trip = readJsonFromCliValue("trip", args.trip, undefined);
    const route = readJsonFromCliValue("route", args.route, undefined);
    const validation = readJsonFromCliValue("validation", args.validation, undefined);
    const results = readJsonFromCliValue("results", args.results, {});
    console.log(
      JSON.stringify(buildBookingReadyPackage(trip, route, validation, results), null, 2),
    );
  },
});
