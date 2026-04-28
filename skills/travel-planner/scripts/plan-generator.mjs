/**
 * Travel Plan Generator
 *
 * 单步独立原则：本模块只消费 travel_db 中已持久化的 trip 记录。
 * 每个计算步骤由 agent 按 SKILL.md workflow 独立调用对应脚本写入 DB，
 * plan_generator 仅负责将已有数据组合为骨架计划输出，不再补算缺失阶段。
 */

import fs from "node:fs";
import path from "node:path";
import {
  assertOnlyFlags,
  readJsonFromCliValue,
  requireCmd,
  requireFlag,
  runScript,
} from "./cli_args.mjs";
import { getPreferences, getSelectedRoute, getTripById } from "./db.mjs";
import {
  getTripArtifactsDir,
  readStep4PlanOutput,
  readStep5RouteValidation,
} from "./trips.mjs";

const STEP6_PLAN_OVERVIEW_FILE = "step6.plan-overview.json";

/** CLI `--cmd` values (snake_case，与 trips.mjs 一致). */
const PLAN_CMD = {
  FULL_PLAN: "full_plan",
  PLAN_OVERVIEW: "plan_overview",
  ITINERARY_SKELETON: "itinerary_skeleton",
};

const CMD_FLAGS = {
  [PLAN_CMD.FULL_PLAN]: ["cmd", "trip-id", "trip-json", "output"],
  [PLAN_CMD.PLAN_OVERVIEW]: ["cmd", "trip-id", "output"],
  [PLAN_CMD.ITINERARY_SKELETON]: ["cmd", "trip-id", "trip-json", "output"],
};

/**
 * Persist Step 6 summary fields for replay / audit (same tree as step4/step5 artifacts).
 * @param {string} tripId
 * @param {Record<string, unknown>} step6View Output of selectPlanViewByCmd(..., plan_overview)
 * @returns {string} Absolute path written
 */
export function persistStep6PlanOverview(tripId, step6View) {
  const summary = step6View?.step6_summary;
  if (!summary || typeof summary !== "object") {
    throw new Error(
      "persistStep6PlanOverview: missing step6_summary on step 6 view",
    );
  }
  const dir = getTripArtifactsDir(tripId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, STEP6_PLAN_OVERVIEW_FILE);
  const payload = {
    schema_version: 1,
    trip_id: String(tripId),
    generated_at: String(step6View.generated_at || new Date().toISOString()),
    chosen_route_id: String(step6View.chosen_route_id ?? ""),
    route_validation_status: String(step6View.route_validation_status ?? ""),
    route_overview_text: summary.route_overview_text ?? "",
    daily_overview: summary.daily_overview ?? [],
    transport_snapshot: summary.transport_snapshot ?? {},
    weather_table_rows: summary.weather_table_rows ?? [],
    template_hint: summary.template_hint ?? {},
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

export function inferTripStage(tripData) {
  // `trips.mjs` already normalizes canonical stage when persisting.
  if (tripData.stage) return tripData.stage;
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
 * Step 4 权威：`data/trips/<id>/step4.plan-output.json`（`trip.step4_plan_output_ref`）。
 * Step 4 决策轻量：`trip.route_plan`（save_route_plan 写入的 id / platform / decision_summary）。
 * 不在此重复拼装“路线框定”对象；渲染路线选项与 tool UI 请读 `plan_output`。
 */
function buildRoutePlanView(tripData) {
  const step4 = readStep4PlanOutput(tripData);
  const decision =
    tripData.route_plan && typeof tripData.route_plan === "object"
      ? tripData.route_plan
      : null;
  const ref = String(tripData.step4_plan_output_ref || "").trim();
  if (step4 && typeof step4 === "object") {
    return {
      source: "step4.plan-output.json",
      step4_plan_output_ref: ref,
      plan_output: step4,
      decision,
      next_action: "",
    };
  }
  return {
    source: "none",
    step4_plan_output_ref: ref,
    plan_output: null,
    decision,
    next_action:
      "跳转第四步：调用 route-plan.mjs 生成候选路线，" +
      "再通过 travel_db --cmd=save_route_plan 持久化 step4.plan-output.json，然后重新调用 plan_generator。",
  };
}

export function generatePlanSkeleton(tripData, preferences) {
  const destination = tripData.destination || {};
  const route = getSelectedRoute(tripData) || {};
  const travelers = tripData.travelers || 2;
  const duration = tripData.duration_days || 7;
  const budgetTotal = tripData.budget?.total || 0;

  return {
    headline: `${destination.city || destination.region || destination.country || "目的地"} ${duration} 天骨架计划`,
    route_title: route.title || "建议路线",
    route_summary: route.summary || "",
    stay_strategy: route.stay_strategy || "在路线确认前尽量减少换酒店次数。",
    transport_strategy:
      route.suggested_transport ||
      "先确定锤子城市与主要交通方式，再展开每日细节。",
    budget_snapshot: {
      total: budgetTotal,
      travelers,
      daily_average:
        duration && budgetTotal
          ? Math.round((budgetTotal / duration) * 100) / 100
          : 0,
    },
    questions_to_confirm: [
      "该路线是否符合你设想的行程？",
      "想要减少换乘摩擦，还是追求更强景观收益？",
      "优先内化预算、舒适度还是必打打卡点？",
    ],
    approval_rule: "交通和酒店验证完成后才进入可下单计划阶段。",
  };
}

export function generateDailyItinerary(
  destination,
  tripData,
  selectedRoute,
  interests,
  pace = "moderate",
) {
  const itinerary = [];
  const numDays = Number.parseInt(String(tripData.duration_days || 7), 10);
  const departureDate = tripData.departure_date || "";
  const destinationName =
    destination.city || destination.region || destination.country || "目的地";

  for (let day = 1; day <= numDays; day++) {
    const isArrivalDay = day === 1;
    const isDepartureDay = day === numDays;
    const dateValue = dateForDay(departureDate, day - 1);
    const anchorType = isArrivalDay
      ? "arrival"
      : isDepartureDay
        ? "departure"
        : "core-exploration";
    const energyLoad =
      isArrivalDay || isDepartureDay
        ? "轻"
        : pace === "moderate"
          ? "适中"
          : pace;

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
      route_context: selectedRoute.title || "",
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
      notes: [
        "此日程卡是结构框架，不是最终景点清单。",
        "确定酒店区域与主要交通后再喆入具体 POI。",
      ],
      // Step 7 D-1 查询后由 Agent 填入，plan-generator 仅预留占位
      hotel_candidates: [],
    });
  }
  return itinerary;
}

export function calculateBudgetBreakdown(
  totalBudget,
  numDays,
  accommodationLevel = "mid_range",
) {
  const normalizedLevel = String(accommodationLevel || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const allocations = {
    budget: {
      accommodation: 0.38,
      food: 0.24,
      activities: 0.18,
      transportation: 0.14,
      miscellaneous: 0.06,
    },
    mid_range: {
      accommodation: 0.35,
      food: 0.24,
      activities: 0.22,
      transportation: 0.13,
      miscellaneous: 0.06,
    },
    high_end: {
      accommodation: 0.43,
      food: 0.2,
      activities: 0.18,
      transportation: 0.13,
      miscellaneous: 0.06,
    },
    economy: {
      accommodation: 0.32,
      food: 0.25,
      activities: 0.2,
      transportation: 0.17,
      miscellaneous: 0.06,
    },
  };

  const allocation =
    allocations[normalizedLevel] || allocations.mid_range;
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
    daily_average:
      numDays > 0 ? Math.round((totalBudget / numDays) * 100) / 100 : 0,
    guidance: [
      "Use route choice and hotel zone to pressure-test this budget.",
      "Protect a 10-15% buffer before booking optional experiences.",
    ],
  };
}

function summarizeValidationState(routeValidation) {
  const validation =
    routeValidation && typeof routeValidation === "object"
      ? routeValidation
      : {};
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

/**
 * Merge `trip.route_validation` with on-disk `step5.route-validation.json`.
 * Step 5 file wins for `weather_result` / `transport_result`（及顶层其它字段），与上一步落盘一致。
 */
function mergeRouteValidationWithStep5File(tripData) {
  const fromTrip =
    tripData.route_validation && typeof tripData.route_validation === "object"
      ? tripData.route_validation
      : {};
  const fromDisk = readStep5RouteValidation(tripData.id);
  if (!fromDisk) return fromTrip;
  const trTrip =
    fromTrip.transport_result && typeof fromTrip.transport_result === "object"
      ? fromTrip.transport_result
      : {};
  const trDisk =
    fromDisk.transport_result && typeof fromDisk.transport_result === "object"
      ? fromDisk.transport_result
      : null;
  const wrTrip =
    fromTrip.weather_result && typeof fromTrip.weather_result === "object"
      ? fromTrip.weather_result
      : {};
  const wrDisk =
    fromDisk.weather_result && typeof fromDisk.weather_result === "object"
      ? fromDisk.weather_result
      : null;
  return {
    ...fromTrip,
    ...fromDisk,
    transport_result: trDisk ? { ...trTrip, ...trDisk } : { ...trTrip },
    weather_result: wrDisk ? { ...wrTrip, ...wrDisk } : { ...wrTrip },
  };
}

function normalizeStops(route) {
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return stops.map((stop) => String(stop || "").trim()).filter(Boolean);
}

function buildRouteOverviewText(route, destination) {
  const stops = normalizeStops(route);
  if (stops.length >= 2) return stops.join(" → ");
  return (
    route?.title ||
    destination.city ||
    destination.region ||
    destination.country ||
    "待确认路线"
  );
}

function buildDailyOverviewEntries(itinerary, route) {
  const stops = normalizeStops(route);
  return itinerary.map((dayCard, index) => {
    const startStop = stops[index] || stops[0] || "";
    const endStop =
      stops[index + 1] || startStop || stops[stops.length - 1] || "";
    const routeLineCore =
      startStop && endStop
        ? `${startStop} → ${endStop}`
        : startStop || endStop || "路线待确认";
    const routeLine = `${routeLineCore}（约待确认km，待确认h）`;
    const lodging =
      String(dayCard?.lodging?.name || "").trim() || "待确认住宿区域";
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

function buildTransportSnapshot(validation, selectedRoute) {
  const tr =
    validation?.transport_result &&
    typeof validation.transport_result === "object"
      ? validation.transport_result
      : {};
  const raw = tr.raw && typeof tr.raw === "object" ? tr.raw : {};
  const status = String(tr.status || "").toLowerCase();
  const mode = String(tr.mode || "").toLowerCase();
  const required = tr.required !== false;

  const flights = Array.isArray(raw.flights) ? raw.flights : [];
  const trains = Array.isArray(raw.trains) ? raw.trains : [];
  const flightsList =
    flights.length > 0
      ? flights
      : Array.isArray(raw.flight_options)
        ? raw.flight_options
        : Array.isArray(raw.flight_candidates)
          ? raw.flight_candidates
          : [];
  const trainsList =
    trains.length > 0
      ? trains
      : Array.isArray(raw.train_options)
        ? raw.train_options
        : Array.isArray(raw.trains_list)
          ? raw.trains_list
          : [];

  const rawText = JSON.stringify(raw);
  const hasFlightText = /航班|flight|机票/i.test(rawText);
  const hasTrainText = /高铁|动车|train|rail/i.test(rawText);
  const driveSegments =
    raw["自驾段"] &&
    typeof raw["自驾段"] === "object" &&
    !Array.isArray(raw["自驾段"])
      ? Object.keys(raw["自驾段"])
      : [];
  const driveMode =
    mode === "drive" || mode === "self_drive" || mode.includes("self_drive");
  const stops = normalizeStops(selectedRoute);

  let flight = "暂无已验证机票信息";
  if (flightsList.length > 0 || hasFlightText) {
    flight = "已验证（存在机票候选）";
  } else if (status === "not_required") {
    flight = "无需机票验证（Step5：长途交通 not_required）";
  } else if (
    status === "ok" &&
    (mode === "flight" || mode === "plane" || mode === "air")
  ) {
    flight = "已验证（Step5：航班结论为可行）";
  } else if (
    status === "unavailable" &&
    required &&
    (mode === "flight" || mode === "plane" || mode === "air")
  ) {
    flight = "已验证：暂无可行机票（Step5：unavailable）";
  }

  let train = "暂无已验证高铁信息";
  if (trainsList.length > 0 || hasTrainText) {
    train = "已验证（存在高铁候选）";
  } else if (status === "not_required") {
    train = "无需高铁验证（Step5：长途交通 not_required）";
  } else if (
    status === "ok" &&
    (mode === "train" || mode === "rail" || mode === "高铁")
  ) {
    train = "已验证（Step5：铁路结论为可行）";
  } else if (
    status === "unavailable" &&
    (mode === "train" || mode === "rail" || mode === "高铁")
  ) {
    train = "已验证：暂无可行铁路方案（Step5：unavailable）";
  }

  let drive = "暂无自驾核验信息";
  if (driveMode || driveSegments.length > 0) {
    drive =
      status === "ok"
        ? "已验证（Step5：自驾/驾车分段已关注）"
        : status === "unavailable"
          ? "已验证：自驾分段存在障碍（Step5：unavailable）"
          : `建议关注自驾分段：${
              (driveSegments.length > 0 ? driveSegments[0] : "") ||
              stops.slice(0, 2).join(" → ") ||
              "待确认路段"
            }`;
  } else if (stops.length >= 2) {
    drive = `建议关注自驾分段：${stops.slice(0, 2).join(" → ") || "待确认路段"}`;
  }

  return { flight, train, drive };
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
  if (
    candidateArray.length === 0 &&
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw)
  ) {
    /** @type {Array<Record<string, string>>} */
    const rows = [];
    for (const [location, value] of Object.entries(raw)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const entries = Object.entries(value);
        for (const [date, detail] of entries) {
          const detailText = String(detail || "").trim();
          const risk = /雷暴|暴雨|大雪|大风|雨/.test(detailText)
            ? "中"
            : "正常";
          rows.push({
            location: String(location || "").trim(),
            date: String(date || "").trim(),
            condition: detailText || "未实时验证",
            temperature: "-",
            risk,
          });
        }
      } else if (typeof value === "string") {
        rows.push({
          location: String(location || "").trim(),
          date: "",
          condition: value.trim() || "未实时验证",
          temperature: "-",
          risk: /雷暴|暴雨|大雪|大风|雨/.test(value) ? "中" : "正常",
        });
      }
    }
    if (rows.length > 0) return rows;
  }
  const rows = candidateArray
    .map((item) => ({
      location: String(item?.location || item?.city || item?.name || "").trim(),
      date: String(item?.date || item?.forecast_date || "").trim(),
      condition: String(
        item?.condition || item?.weather || item?.summary || "未实时验证",
      ).trim(),
      temperature: String(
        item?.temperature || item?.temp || item?.temperature_range || "-",
      ).trim(),
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
  const defaultLocations =
    checked.length > 0
      ? checked
      : dailyOverview.map((item) => item.route_line.split("（")[0]);
  const rows = inferWeatherRowsFromRaw(
    validation?.weather_result?.raw,
    defaultLocations,
  );
  return rows.slice(0, Math.max(3, dailyOverview.length));
}

function buildStep6Summary(tripData, selectedRoute, itinerary, validation) {
  const destination = tripData.destination || {};
  const routeOverview = buildRouteOverviewText(selectedRoute, destination);
  const dailyOverview = buildDailyOverviewEntries(itinerary, selectedRoute);
  return {
    route_overview_text: routeOverview,
    daily_overview: dailyOverview,
    transport_snapshot: buildTransportSnapshot(
      validation || {},
      selectedRoute || {},
    ),
    weather_table_rows: buildWeatherTableRows(validation || {}, dailyOverview),
    template_hint: {
      route_overview_title: "路线总览：",
      daily_plan_title: "每日计划：",
      transport_title: "交通情况：",
      weather_title: "天气情况：",
      hotel_section_title: "🏨 今晚住宿推荐：",
      summary_table_title: "## 住宿 & 交通汇总",
    },
  };
}

/**
 * 从已持久化的 trip 记录中组合计划骨架输出。
 *
 * 单步独立原则：
 * - route_plan 读自 step4.plan-output.json + trip.route_plan（决策轻量字段）
 * - route_validation：trip与 `data/trips/<id>/step5.route-validation.json` 合并（磁盘优先交通/天气子对象）
 * Step 8 行前/预订内容不在此组装。
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
  const pace =
    tripData.pace_preference || preferences.pace_preference || "moderate";
  const accommodationLevel = preferences.budget_level || "mid_range";

  const routePlanView = buildRoutePlanView(tripData);
  const routeChoiceConfirmed = tripData.route_choice_confirmed === true;
  const selectedRoute = routeChoiceConfirmed ? getSelectedRoute(tripData) : {};

  const skeleton = generatePlanSkeleton({ ...tripData }, preferences);

  const routeValidationMerged = mergeRouteValidationWithStep5File(tripData);
  const { hasPersistedValidation, validation } = summarizeValidationState(
    routeValidationMerged,
  );
  const itinerarySkeletonReady = routeChoiceConfirmed && hasPersistedValidation;
  const itinerary = itinerarySkeletonReady
    ? generateDailyItinerary(
        destination,
        tripData,
        selectedRoute,
        interests,
        pace,
      )
    : [];

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
    route_plan: routePlanView,
    route_validation: validation,
    route_validation_status: hasPersistedValidation ? "ready" : "missing",
    plan_skeleton: skeleton,
    chosen_route_id: tripData.chosen_route_id || "",
    selected_route: selectedRoute,
    trip_brief: {
      planning_focus: "确认路线、验证交通与天气，并生成每日骨架计划。",
      response_order: [
        ...(!routeChoiceConfirmed ? ["route_options_and_user_choice"] : []),
        ...(routeChoiceConfirmed && !hasPersistedValidation
          ? ["route_validation_and_user_confirmation"]
          : []),
        ...(itinerarySkeletonReady
          ? ["recommendation", "transport_and_hotel_strategy", "day_by_day"]
          : []),
        "budget",
      ],
    },
    step6_summary: step6Summary,
    itinerary,
    budget: calculateBudgetBreakdown(budget, duration, accommodationLevel),
    generated_at: new Date().toISOString(),
  };
}

function selectPlanViewByCmd(plan, cmd) {
  if (cmd === PLAN_CMD.PLAN_OVERVIEW) {
    const routePlanSummary = {
      source: plan.route_plan?.source || "none",
      step4_plan_output_ref: plan.route_plan?.step4_plan_output_ref || "",
      decision: plan.route_plan?.decision || null,
      next_action: plan.route_plan?.next_action || "",
    };
    return {
      trip_id: plan.trip_id,
      requested_cmd: PLAN_CMD.PLAN_OVERVIEW,
      stage: plan.stage,
      chosen_route_id: plan.chosen_route_id,
      route_plan: routePlanSummary,
      route_validation: plan.route_validation,
      route_validation_status: plan.route_validation_status,
      step6_summary: plan.step6_summary,
      generated_at: plan.generated_at,
    };
  }
  if (cmd === PLAN_CMD.ITINERARY_SKELETON) {
    return {
      trip_id: plan.trip_id,
      requested_cmd: PLAN_CMD.ITINERARY_SKELETON,
      stage: plan.stage,
      chosen_route_id: plan.chosen_route_id,
      route_validation_status: plan.route_validation_status,
      itinerary: plan.itinerary,
      trip_brief: plan.trip_brief,
      generated_at: plan.generated_at,
    };
  }
  throw new Error(`selectPlanViewByCmd: unsupported cmd ${cmd}`);
}

function emitPlanOutput(args, outputPlan) {
  if (args.output !== undefined && args.output !== "") {
    const outPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(outputPlan, null, 2), "utf8");
    console.log(`✓ 骨架计划已生成：${outPath}`);
  } else {
    console.log(JSON.stringify(outputPlan, null, 2));
  }
}

runScript({
  name: "plan_generator.mjs",
  description: "读取 travel_db 中已持久化的 trip 记录，输出结构化骨架计划 JSON",
  usage:
    "node plan_generator.mjs --cmd=<name> [flags...]\n" +
    "  --cmd=full_plan | plan_overview | itinerary_skeleton\n" +
    "  full_plan / itinerary_skeleton：--trip-id=... 或 --trip-json=...（二选一），可选 --output=...\n" +
    "  plan_overview：仅 --trip-id=...（强制写入 data/trips/<id>/step6.plan-overview.json），可选 --output=...",
  flags: Object.keys(CMD_FLAGS)
    .flatMap((cmd) =>
      CMD_FLAGS[cmd].map((f) => ({ name: f, desc: `用于 --cmd=${cmd}` })),
    )
    .filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i),
  required: ["cmd"],
  callerUrl: import.meta.url,
  run(args) {
    const command = requireCmd(args);
    const allowed = CMD_FLAGS[command];
    if (!allowed) {
      console.error(`未知 --cmd 值: ${command}`);
      process.exit(1);
    }
    assertOnlyFlags(args, allowed);

    const hasJson = args["trip-json"] !== undefined && args["trip-json"] !== "";
    const hasId = args["trip-id"] !== undefined && args["trip-id"] !== "";

    if (command === PLAN_CMD.PLAN_OVERVIEW) {
      const id = requireFlag(args, "trip-id");
      const trip = getTripById(id);
      if (!trip) {
        console.error(`错误：未找到 Trip ${id}`);
        process.exit(1);
      }
      const plan = generateTripPlan(trip);
      const outputPlan = selectPlanViewByCmd(plan, PLAN_CMD.PLAN_OVERVIEW);
      const written = persistStep6PlanOverview(id, outputPlan);
      console.error("plan_overview 已落盘：" + written);
      emitPlanOutput(args, outputPlan);
      return;
    }

    if (hasJson && hasId) {
      console.error("错误：请仅使用 --trip-json=... 或 --trip-id=... 之一");
      process.exit(1);
    }
    if (!hasJson && !hasId) {
      console.error(
        "错误：需要 --trip-json=... 或 --trip-id=... (详见 --help)",
      );
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
    const outputPlan =
      command === PLAN_CMD.FULL_PLAN
        ? { ...plan, requested_cmd: PLAN_CMD.FULL_PLAN }
        : selectPlanViewByCmd(plan, PLAN_CMD.ITINERARY_SKELETON);

    emitPlanOutput(args, outputPlan);
  },
});
