/**
 * Travel Plan Generator
 *
 * 单步独立原则：本模块只消费 travel_db 中已持久化的 trip 记录。
 * 每个计算步骤由 agent 按 SKILL.md workflow 独立调用对应脚本写入 DB，
 * plan_generator 仅负责将已有数据组合为骨架计划输出，不再补算缺失阶段。
 */

import fs from "node:fs";
import path from "node:path";
import { buildPreTripBrief } from "./briefing.mjs";
import { readJsonFromCliValue, requireFlag, runScript } from "./cli_args.mjs";
import { getPreferences, getSelectedRoute, getTripById } from "./db.mjs";

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
  if (tripData.chosen_route_id) return "plan_ready";
  if (tripData.route_options?.length) return "route_plan";
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
  const normalizedPace = String(pace || "moderate").toLowerCase();
  if (pace === "relaxed") return "1 主锤点 + 1 可选支线";
  if (normalizedPace === "packed" || normalizedPace === "intensive") {
    return "2 主锤点 + 1 晚间备选";
  }
  return "1 主锤点 + 1 附近区域";
}

/**
 * 读取 trip 中已持久化的 route_plan（由 route_selector.mjs + save_route_plan 写入）。
 * 若尚未持久化，返回占位结构提示 agent 先走第四步。
 */
export function generateRouteFraming(tripData) {
  const existing = tripData.route_plan;
  if (existing && typeof existing === "object") {
    const recommended = getSelectedRoute(tripData);
    const allOptions = Array.isArray(tripData.route_options) ? tripData.route_options : [];
    const altIds = Array.isArray(existing.alternative_ids) ? existing.alternative_ids : [];
    const rejectedIds = Array.isArray(existing.rejected_route_ids) ? existing.rejected_route_ids : [];
    const alternatives = altIds
      .map((routeId) => allOptions.find((option) => option?.route_id === routeId))
      .filter(Boolean);
    const rejectedRoutes = rejectedIds
      .map((routeId) => allOptions.find((option) => option?.route_id === routeId))
      .filter(Boolean);
    const evidenceMeta = tripData.route_evidence_meta || {};
    const quality = String(evidenceMeta.quality || "").toLowerCase();
    const verificationStatus = String(evidenceMeta.verification_status || "");
    const sourceConfidence =
      quality === "high"
        ? "high"
        : quality === "medium"
          ? "medium"
          : quality === "low"
            ? "low"
            : existing.recommended_route_id
              ? "persisted"
              : "none";
    const sourceReason = String(existing?.decision_summary?.source_reason || "");
    if (recommended && Object.keys(recommended).length > 0) {
      return {
        stage: "route_plan",
        recommended_route: recommended,
        alternatives,
        rejected_routes: rejectedRoutes,
        used_platform: existing.used_platform || "",
        fallback_count: Number(existing.fallback_count || 0),
        fallback_reason: existing.fallback_reason || "",
        source_reason: sourceReason,
        source_confidence: sourceConfidence,
        verification_status: verificationStatus,
        evidence_summary: "",
        evidence_links: [],
        next_action: "",
        decision_summary: existing.decision_summary || {
          headline: recommended.title || "",
          why_now: "路线第四步已输出并持久化。",
          planning_note: "",
        },
      };
    }
  }

  // route_plan 尚未写入：返回占位结构，提示 agent 进入第四步
  return {
    stage: "intake",
    recommended_route: {},
    alternatives: [],
    rejected_routes: [],
    used_platform: "",
    fallback_count: 0,
    fallback_reason: "",
    source_reason: "",
    source_confidence: "none",
    evidence_summary: "",
    evidence_links: [],
    next_action:
      "跳转第四步：调用 route_selector.mjs 生成候选路线，" +
      "再通过 travel_db --cmd=save_route_plan 持久化，然后重新调用 plan_generator。",
    decision_summary: {},
  };
}

export function generatePlanSkeleton(tripData, preferences) {
  const destination = tripData.destination || {};
  // Resolve the selected route object from route_options; fall back to persisted route_plan.
  const route =
    getSelectedRoute(tripData) || generateRouteFraming(tripData).recommended_route || {};
  const travelers = tripData.travelers || 2;
  const duration = tripData.duration_days || 7;
  const budgetTotal = tripData.budget?.total || 0;

  return {
    headline: `${destination.city || destination.region || destination.country || "目的地"} ${duration} 天骨架计划`,
    route_title: route.title || "建议路线",
    route_summary: route.summary || "",
    stay_strategy: route.stay_strategy || "在路线确认前尽量减少换酒店次数。",
    transport_strategy:
      route.suggested_transport || "先确定锤子城市与主要交通方式，再展开每日细节。",
    budget_snapshot: {
      total: budgetTotal,
      travelers,
      daily_average: duration && budgetTotal ? Math.round((budgetTotal / duration) * 100) / 100 : 0,
    },
    questions_to_confirm: [
      "该路线是否符合你设想的行程？",
      "想要减少换乘摩擦，还是追求更强景观收益？",
      "优先内化预算、舒适度还是必打打卡点？",
    ],
    approval_rule: "交通和酒店验证完成后才进入可下单计划阶段。",
  };
}

export function generateDailyItinerary(destination, tripData, interests, pace = "moderate") {
  const itinerary = [];
  const numDays = Number.parseInt(String(tripData.duration_days || 7), 10);
  const departureDate = tripData.departure_date || "";
  const route = getSelectedRoute(tripData);
  const destinationName = destination.city || destination.region || destination.country || "目的地";

  for (let day = 1; day <= numDays; day++) {
    const isArrivalDay = day === 1;
    const isDepartureDay = day === numDays;
    const dateValue = dateForDay(departureDate, day - 1);
    const anchorType = isArrivalDay ? "arrival" : isDepartureDay ? "departure" : "core-exploration";
    const energyLoad = isArrivalDay || isDepartureDay ? "轻" : pace === "moderate" ? "适中" : pace;

    itinerary.push({
      day,
      date: dateValue,
      theme: isArrivalDay
        ? "抗达与安顿"
        : isDepartureDay
          ? "返程缓冲日"
          : `${destinationName}探索日`,
      primary_goal: isArrivalDay
        ? "顺利落地、办理入住，保持第一天轻松。"
        : isDepartureDay
          ? "保护返程路径，仅保留低风险等待项。"
          : `围绕 ${interests.slice(0, 2).join("、") || "主路线"} 建立一个主锤点体验。`,
      secondary_goal: isArrivalDay
        ? "配酒店附近短途散步 + 一顿轻松第一餐。"
        : isDepartureDay
          ? "酒店或车站附近一项紧凑收尾活动。"
          : "体力、天气、队伍都 OK 时，可加一个附近备选点。",
      route_context: route.title || "",
      anchor_type: anchorType,
      time_anchors: [
        {
          window: "上午",
          focus: isArrivalDay ? "抗达 / 转场缓冲" : "主锤点活动窗口",
          notes: "交通确认后安排固定时间项目。",
        },
        {
          window: "下午",
          focus: "核心探索区域",
          notes: "集群附近站点，避免走回头路。",
        },
        {
          window: "晚间",
          focus: "晚餐 + 低风险备选项",
          notes: "疆立或天气不佳时可跳过此项。",
        },
      ],
      activity_density: activityDensity(pace),
      transit_strategy: isArrivalDay
        ? "优先选择机场/站至酒店摘开压力最小的换乘方式。"
        : isDepartureDay
          ? "从返程截止时间倒推，不扬偏远绕行。"
          : "选定一个地理群落，预留 20-30% 缓冲时间。",
      meal_strategy: {
        breakfast: "酒店内或附近低摩擦咖啡馆",
        lunch: "附近主锤点就餐",
        dinner: "晚间区域用餐，热门店建议列候（或提前预订）",
      },
      energy_load: energyLoad,
      estimated_cost_band: "中",
      booking_watchouts: [
        "需预约时段的景点限时入内展项应优先于小类加项。",
        "抗达日和返程日不应依赖紧迎挂。",
      ],
      weather_backup: "天气不佳时切换为同区域層内或低机动性备选。",
      notes: ["此日程卡是结构框架，不是最终景点清单。", "确定酒店区域与主要交通后再喆入具体 POI。"],
    });
  }
  return itinerary;
}

export function hydrateItineraryWithBookingReady(itinerary, bookingReady, confirmedBookings) {
  if (!itinerary?.length) return itinerary;

  const chosenTransport =
    confirmedBookings.flight || confirmedBookings.train || bookingReady.chosen_transport || {};
  const chosenHotel = confirmedBookings.hotel || bookingReady.chosen_hotel || {};
  const chosenDining = confirmedBookings.dining || bookingReady.chosen_dining || {};
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
    nextDay.meal_recommendation = {
      name: chosenDining.name || "",
      category: chosenDining.category || "",
      address: chosenDining.address || "",
      booking_link: chosenDining.booking_link || "",
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
    if (chosenDining.name) {
      nextDay.notes = [
        ...(nextDay.notes || []),
        `Dining pick from live results: ${chosenDining.name}.`,
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

function summarizeValidationState(routeValidation) {
  const validation = routeValidation && typeof routeValidation === "object" ? routeValidation : {};
  const hasPersistedValidation =
    String(validation.verdict || "").trim() !== "" ||
    String(validation.checked_at || "").trim() !== "" ||
    Boolean(validation.transport_result?.checked) ||
    (validation.weather_result?.locations_checked || []).length > 0;

  return {
    hasPersistedValidation,
    validation: hasPersistedValidation ? validation : null,
  };
}

function hasNonEmptyLink(value) {
  const text = String(value || "").trim();
  return text.startsWith("http://") || text.startsWith("https://");
}

function hasRealBookingEvidence(bookingReady) {
  if (!bookingReady || typeof bookingReady !== "object") return false;
  const transportLink = hasNonEmptyLink(bookingReady?.chosen_transport?.booking_link);
  const hotelLink = hasNonEmptyLink(bookingReady?.chosen_hotel?.booking_link);
  const diningLink = hasNonEmptyLink(bookingReady?.chosen_dining?.booking_link);
  return transportLink && hotelLink && diningLink;
}

function normalizeStops(route) {
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return stops.map((stop) => String(stop || "").trim()).filter(Boolean);
}

function buildRouteOverviewText(route, destination) {
  const stops = normalizeStops(route);
  if (stops.length >= 2) return stops.join(" → ");
  return route?.title || destination.city || destination.region || destination.country || "待确认路线";
}

function buildDailyOverviewEntries(itinerary, route) {
  const stops = normalizeStops(route);
  return itinerary.map((dayCard, index) => {
    const startStop = stops[index] || stops[0] || "";
    const endStop = stops[index + 1] || startStop || stops[stops.length - 1] || "";
    const routeLineCore =
      startStop && endStop ? `${startStop} → ${endStop}` : startStop || endStop || "路线待确认";
    const routeLine = `${routeLineCore}（约待确认km，待确认h）`;
    const lodging = String(dayCard?.lodging?.name || "").trim() || "待确认住宿区域";
    const secondary = String(dayCard?.secondary_goal || "").trim();
    return {
      day: Number(dayCard?.day || index + 1),
      route_line: routeLine,
      main_anchor: String(dayCard?.primary_goal || "").trim() || "待确认主锚点",
      secondary_anchor: secondary || "可选次锚点待确认",
      lodging,
    };
  });
}

function buildTransportSnapshot(tripData, validation, selectedRoute) {
  const raw = validation?.transport_result?.raw || {};
  const flights = []
    .concat(Array.isArray(raw?.flights) ? raw.flights : [])
    .concat(Array.isArray(tripData?.live_results?.flights?.data?.items) ? tripData.live_results.flights.data.items : []);
  const trains = []
    .concat(Array.isArray(raw?.trains) ? raw.trains : [])
    .concat(Array.isArray(tripData?.live_results?.transport?.trains) ? tripData.live_results.transport.trains : []);
  const driveMode =
    String(validation?.transport_result?.mode || "").toLowerCase() === "drive" ||
    String(validation?.transport_result?.mode || "").toLowerCase() === "self_drive";
  const stops = normalizeStops(selectedRoute);
  return {
    flight: flights.length > 0 ? "已验证（存在机票候选）" : "暂无已验证机票信息",
    train: trains.length > 0 ? "已验证（存在高铁候选）" : "暂无已验证高铁信息",
    drive:
      driveMode || stops.length >= 2
        ? `建议关注自驾分段：${stops.slice(0, 2).join(" → ") || "待确认路段"}`
        : "暂无自驾核验信息",
  };
}

function inferWeatherRowsFromRaw(raw, defaultLocations = []) {
  if (!raw || typeof raw !== "object") {
    return defaultLocations.map((location) => ({
      location,
      date: "",
      condition: "未实时验证",
      temperature: "-",
      risk: "待核验",
    }));
  }
  const candidateArray = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.locations)
      ? raw.locations
      : Array.isArray(raw.items)
        ? raw.items
        : [];
  const rows = candidateArray
    .map((item) => ({
      location: String(item?.location || item?.city || item?.name || "").trim(),
      date: String(item?.date || item?.forecast_date || "").trim(),
      condition: String(item?.condition || item?.weather || item?.summary || "未实时验证").trim(),
      temperature: String(item?.temperature || item?.temp || item?.temperature_range || "-").trim(),
      risk: String(item?.risk || item?.warning || "").trim() || "正常",
    }))
    .filter((item) => item.location);
  if (rows.length > 0) return rows;
  return defaultLocations.map((location) => ({
    location,
    date: "",
    condition: "未实时验证",
    temperature: "-",
    risk: "待核验",
  }));
}

function buildWeatherTableRows(validation, dailyOverview) {
  const checked = Array.isArray(validation?.weather_result?.locations_checked)
    ? validation.weather_result.locations_checked
    : [];
  const defaultLocations = checked.length > 0 ? checked : dailyOverview.map((item) => item.route_line.split("（")[0]);
  const rows = inferWeatherRowsFromRaw(validation?.weather_result?.raw, defaultLocations);
  return rows.slice(0, Math.max(3, dailyOverview.length));
}

function buildStep6Summary(tripData, selectedRoute, itinerary, validation) {
  const destination = tripData.destination || {};
  const routeOverview = buildRouteOverviewText(selectedRoute, destination);
  const dailyOverview = buildDailyOverviewEntries(itinerary, selectedRoute);
  return {
    route_overview_text: routeOverview,
    daily_overview: dailyOverview,
    transport_snapshot: buildTransportSnapshot(tripData, validation || {}, selectedRoute || {}),
    weather_table_rows: buildWeatherTableRows(validation || {}, dailyOverview),
    template_hint: {
      route_overview_title: "路线总览：",
      daily_plan_title: "每日计划：",
      transport_title: "交通情况：",
      weather_title: "天气情况：",
    },
  };
}

/**
 * 从已持久化的 trip 记录中组合计划骨架输出。
 *
 * 单步独立原则：
 * - route_plan  读自 trip.route_plan（第四步写入）
 * - route_validation 读自 trip.route_validation（第五步写入）
 * - booking_ready  读自 trip.booking_ready（第七步写入）
 * 本函数不主动调用计算模块，只做读取与拼装。
 */
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

  const routeFraming = generateRouteFraming(tripData);
  const routeChoiceConfirmed = tripData.route_choice_confirmed === true;
  const selectedRoute = routeChoiceConfirmed ? getSelectedRoute(tripData) : {};

  const skeleton = generatePlanSkeleton({ ...tripData }, preferences);

  const { hasPersistedValidation, validation } = summarizeValidationState(tripData.route_validation);
  const bookingReady = tripData.booking_ready || {};
  const bookingReadyStatus = bookingReady.status || "";
  const hasBookingReady = bookingReadyStatus === "ready";
  const hasBookingLinks = hasRealBookingEvidence(bookingReady);
  const itinerarySkeletonReady = routeChoiceConfirmed && hasPersistedValidation;
  const itinerarySkeleton = itinerarySkeletonReady
    ? generateDailyItinerary(destination, tripData, interests, pace)
    : [];
  const itinerary = hasBookingReady
    ? hydrateItineraryWithBookingReady(
        itinerarySkeleton,
        bookingReady,
        tripData.confirmed_bookings || {},
      )
    : itinerarySkeleton;
  const preTripMaterialsReady = hasBookingReady || Boolean(tripData.during_trip);
  const preTripChecklist = preTripMaterialsReady
    ? generatePreTripChecklist(destination.country || "", departureDate)
    : [];
  const preTripBrief = preTripMaterialsReady
    ? buildPreTripBrief(tripData, {
        booking_ready: bookingReady,
        pre_trip_checklist: preTripChecklist,
        itinerary,
      })
    : null;
  const packingChecklist = preTripMaterialsReady
    ? generatePackingChecklist(tripData.climate || "moderate", duration, tripData.activities || [])
    : {};

  const bookingStrategy = {
    status: !routeChoiceConfirmed
      ? "needs_route_choice"
      : !hasPersistedValidation
        ? "needs_route_validation"
        : hasBookingReady
          ? hasBookingLinks
            ? "booking_ready"
            : "needs_live_links"
          : "needs_booking_ready",
    next_actions: [
      ...(!routeChoiceConfirmed ? ["先确认路线选项，再进行验证与每日规划。"] : []),
      ...(!hasPersistedValidation ? ["先完成第五步交通与天气验证，并持久化 route_validation。"] : []),
      ...(hasPersistedValidation && !hasBookingReady
        ? ["当前只应输出 Step 7 的简要每日计划；住宿、交通细化等待 Step 8。"]
        : []),
      ...(hasPersistedValidation && !hasBookingReady
        ? ["完成 Step 8 的实时交通/酒店/餐饮查询并保存 booking_ready。"]
        : []),
      ...(hasBookingReady && !hasBookingLinks
        ? ["补齐交通、酒店、餐饮的可分享链接后再进入可下单回复。"]
        : []),
    ],
    decision_gates: Array.isArray(bookingReady.decision_gates) ? bookingReady.decision_gates : [],
  };

  const serviceState = {
    stage: tripData.during_trip
      ? "in_trip"
      : tripData.bookings_confirmed || bookingReadyStatus === "ready"
        ? "pre_trip"
        : "planning",
    ready_for_pre_trip_brief: preTripMaterialsReady,
    ready_for_daily_brief: Boolean(tripData.during_trip),
  };

  const step6Summary = buildStep6Summary(
    tripData,
    selectedRoute,
    itinerarySkeletonReady ? itinerary : [],
    validation,
  );

  return {
    trip_id: tripData.id || "",
    stage,
    destination,
    dates: {
      departure: departureDate,
      return: tripData.return_date || "",
      duration_days: duration,
    },
    route_plan: routeFraming,
    route_validation: validation,
    route_validation_status: hasPersistedValidation ? "ready" : "missing",
    plan_skeleton: skeleton,
    chosen_route_id: tripData.chosen_route_id || "",
    selected_route: selectedRoute,
    booking_strategy: bookingStrategy,
    booking_ready: hasBookingReady ? bookingReady : null,
    service_state: serviceState,
    trip_brief: {
      planning_focus: "确认路线、验证交通与住宿，再合成可下单决策包。",
      response_order: [
        ...(!routeChoiceConfirmed ? ["route_options_and_user_choice"] : []),
        ...(routeChoiceConfirmed && !hasPersistedValidation
          ? ["route_validation_and_user_confirmation"]
          : []),
        ...(itinerarySkeletonReady ? ["recommendation", "transport_and_hotel_strategy", "day_by_day"] : []),
        ...(hasBookingReady ? ["booking_ready_transport_and_hotel_options"] : []),
        "budget",
        ...(preTripMaterialsReady ? ["pre_trip_actions"] : []),
      ],
    },
    step6_summary: step6Summary,
    itinerary,
    budget: calculateBudgetBreakdown(budget, duration, accommodationLevel),
    packing_checklist: packingChecklist,
    pre_trip_checklist: preTripChecklist,
    pre_trip_brief: preTripBrief,
    generated_at: new Date().toISOString(),
  };
}

function selectPlanViewByStep(plan, step) {
  if (step === 6) {
    return {
      trip_id: plan.trip_id,
      requested_step: 6,
      stage: plan.stage,
      chosen_route_id: plan.chosen_route_id,
      route_plan: plan.route_plan,
      route_validation: plan.route_validation,
      step6_summary: plan.step6_summary,
      booking_strategy: plan.booking_strategy,
      next_actions: plan.booking_strategy?.next_actions || [],
      generated_at: plan.generated_at,
    };
  }
  if (step === 7) {
    return {
      trip_id: plan.trip_id,
      requested_step: 7,
      stage: plan.stage,
      chosen_route_id: plan.chosen_route_id,
      route_validation_status: plan.route_validation_status,
      itinerary: plan.itinerary,
      trip_brief: plan.trip_brief,
      booking_strategy: plan.booking_strategy,
      next_actions: plan.booking_strategy?.next_actions || [],
      generated_at: plan.generated_at,
    };
  }
  if (step === 8) {
    return {
      trip_id: plan.trip_id,
      requested_step: 8,
      stage: plan.stage,
      chosen_route_id: plan.chosen_route_id,
      booking_ready: plan.booking_ready,
      booking_strategy: plan.booking_strategy,
      itinerary: plan.itinerary,
      budget: plan.budget,
      pre_trip_checklist: plan.pre_trip_checklist,
      packing_checklist: plan.packing_checklist,
      generated_at: plan.generated_at,
    };
  }
  return { ...plan, requested_step: step };
}

runScript({
  name: "plan_generator.mjs",
  description: "读取 travel_db 中已持久化的 trip 记录，输出结构化骨架计划 JSON",
  usage:
    "node plan_generator.mjs --trip-id=<id> [--step=<n>] [--output=<file>]\n" +
    "  node plan_generator.mjs --trip-json=<json|@file> [--step=<n>] [--output=<file>]",
  flags: [
    { name: "trip-id", desc: "从 travel_db 按 id 加载 trip" },
    { name: "trip-json", desc: "trip 对象 JSON 或 @文件路径" },
    { name: "step", desc: "可选阶段标识（如 6 / 7 / 8），用于上层流程编排" },
    { name: "output", desc: "将 JSON 写入文件（默认输出到 stdout）" },
  ],
  callerUrl: import.meta.url,
  run(args) {
    const hasJson = args["trip-json"] !== undefined && args["trip-json"] !== "";
    const hasId = args["trip-id"] !== undefined && args["trip-id"] !== "";
    if (hasJson && hasId) {
      console.error("错误：请仅使用 --trip-json=... 或 --trip-id=... 之一");
      process.exit(1);
    }
    if (!hasJson && !hasId) {
      console.error("错误：需要 --trip-json=... 或 --trip-id=...  (详情运行 --help)");
      process.exit(1);
    }

    let trip;
    if (hasJson) {
      trip = readJsonFromCliValue("trip-json", args["trip-json"], undefined);
    } else {
      const id = requireFlag(args, "trip-id");
      trip = getTripById(id);
      if (!trip) {
        console.error(`错误：未找到 Trip ${id}`);
        process.exit(1);
      }
    }

    const plan = generateTripPlan(trip);
    const stepRaw = args.step !== undefined && args.step !== "" ? String(args.step).trim() : "";
    const step = stepRaw ? Number.parseInt(stepRaw, 10) : null;
    if (stepRaw && !Number.isFinite(step)) {
      console.error("错误：--step 必须为数字（如 6 / 7 / 8）");
      process.exit(1);
    }
    if (step != null && ![6, 7, 8].includes(step)) {
      console.error("错误：当前仅支持 --step=6|7|8");
      process.exit(1);
    }
    const outputPlan = step != null ? selectPlanViewByStep(plan, step) : plan;
    if (args.output !== undefined && args.output !== "") {
      const outPath = path.resolve(args.output);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(outputPlan, null, 2), "utf8");
      console.log(`✓ 骨架计划已生成：${outPath}`);
    } else {
      console.log(JSON.stringify(outputPlan, null, 2));
    }
  },
});
