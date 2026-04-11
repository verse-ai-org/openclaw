/**
 * Structured weather for Control UI (Tool UI WeatherWidget payload).
 * Fetches wttr.in JSON (World Weather Online via wttr) and maps to version 3.1 schema.
 */
import { Type } from "@sinclair/typebox";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("weather-widget-tool");

const WTTR_TIMEOUT_MS = 20_000;
const WTTR_BASE = "https://wttr.in";

/** Aligns with ui-react WeatherConditionCode / Tool UI weather widget. */
export type WeatherConditionCode =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "thunderstorm"
  | "snow"
  | "sleet"
  | "hail"
  | "windy";

export interface WeatherWidgetPayload {
  version: "3.1";
  id: string;
  location: { name: string };
  units: { temperature: "celsius" | "fahrenheit" };
  current: {
    conditionCode: WeatherConditionCode;
    temperature: number;
    tempMin: number;
    tempMax: number;
    windSpeed?: number;
    precipitationLevel?: "none" | "light" | "moderate" | "heavy";
    visibility?: number;
  };
  forecast: Array<{
    label: string;
    conditionCode: WeatherConditionCode;
    tempMin: number;
    tempMax: number;
  }>;
  time: { timeBucket?: number; localTimeOfDay?: number };
  updatedAt?: string;
}

const ParametersSchema = Type.Object({
  location: Type.String({
    description:
      "City, region, or airport code (e.g. Chengdu, London, ORD). Use ASCII or local spelling as wttr.in accepts.",
  }),
  dayOffset: Type.Optional(
    Type.Number({
      description: "0 = today, 1 = tomorrow, 2 = day after. Default 0.",
      minimum: 0,
      maximum: 3,
    }),
  ),
  units: Type.Optional(
    stringEnum(["celsius", "fahrenheit"] as const, {
      description: "Temperature unit for the widget. Default celsius.",
    }),
  ),
});

/**
 * World Weather Online numeric codes (strings in wttr JSON).
 * @see https://www.worldweatheronline.com/weather/api/api/docs/condition_codes.aspx
 */
export function mapWwoWeatherCodeToCondition(code: string): WeatherConditionCode {
  const n = Number.parseInt(code.trim(), 10);
  if (Number.isNaN(n)) {
    return "cloudy";
  }
  if (n === 113) {
    return "clear";
  }
  if (n === 116) {
    return "partly-cloudy";
  }
  if (n === 119) {
    return "cloudy";
  }
  if (n === 122) {
    return "overcast";
  }
  if (n === 143 || n === 248 || n === 260) {
    return "fog";
  }
  if (n >= 386 && n <= 390) {
    return "thunderstorm";
  }
  if (n === 200 || n === 392 || n === 395) {
    return "thunderstorm";
  }
  if (n === 350 || n === 374 || n === 377) {
    return "hail";
  }
  if (n === 314 || n === 317 || n === 320 || n === 365) {
    return "sleet";
  }
  if (n >= 227 && n <= 230) {
    return "snow";
  }
  if (n >= 323 && n <= 338) {
    return "snow";
  }
  if (n === 302 || n === 305 || n === 308 || n === 311 || n === 356) {
    return "heavy-rain";
  }
  if (n >= 353 && n <= 359) {
    return "heavy-rain";
  }
  if (n >= 296 && n <= 301) {
    return "drizzle";
  }
  if (n >= 176 && n <= 195) {
    return "rain";
  }
  if (n >= 263 && n <= 268) {
    return "rain";
  }
  if (n >= 300 && n <= 321) {
    return n <= 305 ? "drizzle" : "rain";
  }
  if (n >= 370 && n <= 386) {
    return "snow";
  }
  if (n < 150) {
    return "clear";
  }
  if (n < 250) {
    return "rain";
  }
  return "cloudy";
}

function precipLevelFromMm(mm: number): "none" | "light" | "moderate" | "heavy" {
  if (mm <= 0) {
    return "none";
  }
  if (mm < 2.5) {
    return "light";
  }
  if (mm < 7.5) {
    return "moderate";
  }
  return "heavy";
}

function readStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function readNum(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function labelForDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return dateStr;
  }
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function pickHourlyMid(
  hourlies: Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  if (!hourlies.length) {
    return undefined;
  }
  return hourlies[Math.floor(hourlies.length / 2)] ?? hourlies[0];
}

type WttrJ1 = {
  current_condition?: Array<Record<string, unknown>>;
  weather?: Array<{
    date?: string;
    maxtempC?: string;
    mintempC?: string;
    hourly?: Array<Record<string, unknown>>;
  }>;
  nearest_area?: Array<{
    areaName?: Array<{ value?: string }>;
  }>;
};

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function buildPayloadFromWttr(
  data: WttrJ1,
  locationQuery: string,
  dayOffset: number,
  units: "celsius" | "fahrenheit",
): WeatherWidgetPayload {
  const weatherDays = Array.isArray(data.weather) ? data.weather : [];
  const areaName =
    data.nearest_area?.[0]?.areaName?.[0]?.value?.trim() || locationQuery.trim();
  const id = `wttr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  const dayIdx = Math.min(Math.max(0, dayOffset), Math.max(0, weatherDays.length - 1));
  const day = weatherDays[dayIdx] as Record<string, unknown> | undefined;
  const curArr = data.current_condition;
  const cur0 = Array.isArray(curArr) && curArr[0] ? (curArr[0] as Record<string, unknown>) : undefined;
  const w0 = weatherDays[0] as Record<string, unknown> | undefined;

  let temperature: number;
  let tempMin: number;
  let tempMax: number;
  let conditionCode: WeatherConditionCode;
  let windSpeed: number | undefined;
  let precipMm = 0;
  let visibility: number | undefined;

  if (dayOffset === 0 && cur0) {
    const tC = readNum(cur0, "temp_C") ?? 15;
    const w0r = w0 ?? {};
    const maxC = readNum(w0r, "maxtempC") ?? tC + 2;
    const minC = readNum(w0r, "mintempC") ?? tC - 2;
    if (units === "fahrenheit") {
      temperature = cToF(tC);
      tempMax = cToF(maxC);
      tempMin = cToF(minC);
    } else {
      temperature = Math.round(tC);
      tempMax = Math.round(maxC);
      tempMin = Math.round(minC);
    }
    const code = readStr(cur0, "weatherCode") ?? "119";
    conditionCode = mapWwoWeatherCodeToCondition(code);
    windSpeed = readNum(cur0, "windspeedKmph");
    precipMm = readNum(cur0, "precipMM") ?? 0;
    visibility = readNum(cur0, "visibility");
    if (tempMin === tempMax) {
      tempMax = temperature + 1;
      tempMin = temperature - 1;
    }
  } else if (day) {
    const maxC = readNum(day, "maxtempC") ?? 20;
    const minC = readNum(day, "mintempC") ?? 15;
    const mid = pickHourlyMid((day.hourly ?? []) as Array<Record<string, unknown>>);
    const code = readStr(mid ?? {}, "weatherCode") ?? "119";
    conditionCode = mapWwoWeatherCodeToCondition(code);
    const midTempC = Math.round((maxC + minC) / 2);
    if (units === "fahrenheit") {
      temperature = cToF(midTempC);
      tempMax = cToF(maxC);
      tempMin = cToF(minC);
    } else {
      temperature = midTempC;
      tempMax = Math.round(maxC);
      tempMin = Math.round(minC);
    }
    windSpeed = readNum(mid ?? {}, "windspeedKmph");
    precipMm = readNum(mid ?? {}, "precipMM") ?? 0;
    visibility = readNum(mid ?? {}, "visibility");
  } else {
    throw new ToolInputError("Weather data missing forecast days in wttr.in response.");
  }

  const forecast = weatherDays.slice(0, 5).map((w) => {
    const wr = w as Record<string, unknown>;
    const dateStr = readStr(wr, "date") ?? "";
    const maxC = readNum(wr, "maxtempC") ?? 0;
    const minC = readNum(wr, "mintempC") ?? 0;
    const mid = pickHourlyMid((w.hourly ?? []) as Array<Record<string, unknown>>);
    const code = readStr(mid ?? {}, "weatherCode") ?? "119";
    let tMin = Math.round(minC);
    let tMax = Math.round(maxC);
    if (units === "fahrenheit") {
      tMin = Math.round((minC * 9) / 5 + 32);
      tMax = Math.round((maxC * 9) / 5 + 32);
    }
    return {
      label: labelForDate(dateStr),
      conditionCode: mapWwoWeatherCodeToCondition(code),
      tempMin: tMin,
      tempMax: tMax,
    };
  });

  return {
    version: "3.1",
    id,
    location: { name: areaName },
    units: { temperature: units },
    current: {
      conditionCode,
      temperature,
      tempMin,
      tempMax,
      windSpeed,
      precipitationLevel: precipLevelFromMm(precipMm),
      visibility,
    },
    forecast,
    time: { timeBucket: 5, localTimeOfDay: 0.5 },
    updatedAt: new Date().toISOString(),
  };
}

async function fetchWttrJson(location: string): Promise<WttrJ1> {
  const path = encodeURIComponent(location.trim()).replace(/%20/g, "+");
  const url = `${WTTR_BASE}/${path}?format=j1`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), WTTR_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": "OpenClaw/weather_widget (structured UI)" },
    });
    if (!res.ok) {
      throw new ToolInputError(`wttr.in HTTP ${res.status} for location query.`);
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new ToolInputError("wttr.in returned non-JSON (rate limit or error page).");
    }
    if (!data || typeof data !== "object") {
      throw new ToolInputError("Invalid wttr.in JSON payload.");
    }
    return data as WttrJ1;
  } catch (err) {
    if (err instanceof ToolInputError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`wttr fetch failed: ${msg}`);
    throw new ToolInputError(`Weather fetch failed: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

export function createWeatherWidgetTool(): AnyAgentTool {
  return {
    label: "Weather UI",
    name: "weather_widget",
    description:
      "Get current or near-future weather as structured JSON for the chat UI (rich weather card). " +
      "Prefer this over exec/curl when the user asks for weather, temperature, or forecast. " +
      "Uses wttr.in (no API key). Pass city or airport code and optional dayOffset (0=today, 1=tomorrow).",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const location = readStringParam(params, "location", { required: true });
      const dayRaw = params.dayOffset;
      const dayOffset =
        typeof dayRaw === "number" && Number.isFinite(dayRaw)
          ? Math.min(3, Math.max(0, Math.floor(dayRaw)))
          : 0;
      const unitsRaw = params.units;
      const units: "celsius" | "fahrenheit" =
        unitsRaw === "fahrenheit" ? "fahrenheit" : "celsius";

      const data = await fetchWttrJson(location);
      const payload = buildPayloadFromWttr(data, location, dayOffset, units);
      return jsonResult(payload);
    },
  };
}
