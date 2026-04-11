import type { WeatherWidgetPayload } from "@/components/tool-ui/weather-widget/schema-runtime";

const CONDITION_CODES = new Set([
  "clear",
  "partly-cloudy",
  "cloudy",
  "overcast",
  "fog",
  "drizzle",
  "rain",
  "heavy-rain",
  "thunderstorm",
  "snow",
  "sleet",
  "hail",
  "windy",
]);

/**
 * Parse tool result (string JSON or object) into WeatherWidgetPayload for WeatherWidget.
 */
export function tryParseWeatherWidgetPayload(result: unknown): WeatherWidgetPayload | null {
  try {
    let raw: unknown = result;
    if (typeof result === "string") {
      const t = result.trim();
      if (!t.startsWith("{")) {
        return null;
      }
      raw = JSON.parse(t) as unknown;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    const o = raw as Record<string, unknown>;
    if (o.version !== "3.1" || typeof o.id !== "string") {
      return null;
    }
    const loc = o.location;
    if (!loc || typeof loc !== "object" || Array.isArray(loc)) {
      return null;
    }
    const name = (loc as Record<string, unknown>).name;
    if (typeof name !== "string" || !name.trim()) {
      return null;
    }
    const units = o.units;
    if (!units || typeof units !== "object") {
      return null;
    }
    const tempUnit = (units as Record<string, unknown>).temperature;
    if (tempUnit !== "celsius" && tempUnit !== "fahrenheit") {
      return null;
    }
    const cur = o.current;
    if (!cur || typeof cur !== "object") {
      return null;
    }
    const c = cur as Record<string, unknown>;
    if (typeof c.temperature !== "number" || typeof c.tempMin !== "number" || typeof c.tempMax !== "number") {
      return null;
    }
    if (typeof c.conditionCode !== "string" || !CONDITION_CODES.has(c.conditionCode)) {
      return null;
    }
    if (!Array.isArray(o.forecast)) {
      return null;
    }
    const time = o.time;
    if (time != null && typeof time !== "object") {
      return null;
    }
    return raw as WeatherWidgetPayload;
  } catch {
    return null;
  }
}
