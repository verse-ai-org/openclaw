import type { ReactNode } from "react";
import { Chart } from "@/components/tool-ui/chart";
import { CodeBlock } from "@/components/tool-ui/code-block";
import { GeoMap } from "@/components/tool-ui/geo-map";
import { ItemCarousel } from "@/components/tool-ui/item-carousel";
import { LinkPreview } from "@/components/tool-ui/link-preview";
import { StatsDisplay } from "@/components/tool-ui/stats-display";
import { Terminal } from "@/components/tool-ui/terminal";
import { safeParseSerializableChart } from "@/components/tool-ui/chart/schema";
import { safeParseSerializableCodeBlock } from "@/components/tool-ui/code-block/schema";
import { safeParseSerializableGeoMap } from "@/components/tool-ui/geo-map/schema";
import { safeParseSerializableItemCarousel } from "@/components/tool-ui/item-carousel/schema";
import { safeParseSerializableLinkPreview } from "@/components/tool-ui/link-preview/schema";
import { safeParseSerializableStatsDisplay } from "@/components/tool-ui/stats-display/schema";
import { safeParseSerializableTerminal } from "@/components/tool-ui/terminal/schema";
import { WeatherWidget } from "@/components/tool-ui/weather-widget/runtime";
import { parseToolUiPayload } from "./parse-tool-ui-payload";
import { tryParseWeatherWidgetPayload } from "./parse-weather-widget-payload";

export interface RichToolPresentation {
  summary: string;
  content: ReactNode;
  canPromote: boolean;
}

function formatConditionCode(code: string): string {
  return code
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function buildWeatherSummary(result: ReturnType<typeof tryParseWeatherWidgetPayload>): string {
  if (!result) {
    return "Weather preview";
  }
  const location = result.location.name.trim();
  const temperature = `${Math.round(result.current.temperature)}°${result.units.temperature === "celsius" ? "C" : "F"}`;
  const condition = formatConditionCode(result.current.conditionCode);
  return `${location} · ${temperature} · ${condition}`;
}

function buildChartSummary(payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const data = Array.isArray(payload.data) ? payload.data.length : 0;
  if (title && data > 0) {
    return `${title} · ${data} points`;
  }
  if (title) {
    return title;
  }
  if (data > 0) {
    return `${data} points`;
  }
  return "Chart preview";
}

function buildStatsSummary(payload: Record<string, unknown>): string {
  const items = Array.isArray(payload.stats)
    ? payload.stats.length
    : Array.isArray(payload.items)
      ? payload.items.length
      : 0;
  return items > 0 ? `${items} metrics` : "Stats preview";
}

function buildLinkPreviewSummary(payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (title) {
    return title;
  }
  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  return "Link preview";
}

function buildCodeBlockSummary(payload: Record<string, unknown>): string {
  const language = typeof payload.language === "string" ? payload.language.trim() : "";
  return language ? `Code · ${language}` : "Code preview";
}

function buildTerminalSummary(payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const command = typeof payload.command === "string" ? payload.command.trim() : "";
  if (title) {
    return title;
  }
  if (command) {
    return command;
  }
  return "Terminal output";
}

function buildItemCarouselSummary(payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const itemCount = Array.isArray(payload.items) ? payload.items.length : 0;
  if (title && itemCount > 0) {
    return `${title} · ${itemCount} items`;
  }
  if (title) {
    return title;
  }
  if (itemCount > 0) {
    return `${itemCount} items`;
  }
  return "Item carousel";
}

function buildGeoMapSummary(payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const markers = Array.isArray(payload.markers) ? payload.markers.length : 0;
  const routes = Array.isArray(payload.routes) ? payload.routes.length : 0;
  const markerText = markers > 0 ? `${markers} markers` : "No markers";
  const routeText = routes > 0 ? `${routes} routes` : "";
  if (title) {
    return routeText ? `${title} · ${markerText} · ${routeText}` : `${title} · ${markerText}`;
  }
  return routeText ? `${markerText} · ${routeText}` : markerText;
}

export function resolveRichToolPresentation(
  toolName: string,
  result: unknown,
  resultStr?: string,
): RichToolPresentation | null {
  const payload = parseToolUiPayload(result, resultStr);
  if (!payload) {
    return null;
  }

  if (toolName === "weather_widget") {
    const parsed = tryParseWeatherWidgetPayload(result ?? resultStr);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildWeatherSummary(parsed),
      content: <WeatherWidget {...parsed} effects={{ enabled: true, quality: "medium" }} />,
      canPromote: true,
    };
  }

  if (toolName === "code_block") {
    const parsed = safeParseSerializableCodeBlock(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildCodeBlockSummary(payload),
      content: <CodeBlock {...parsed} />,
      canPromote: false,
    };
  }

  if (toolName === "chart") {
    const parsed = safeParseSerializableChart(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildChartSummary(payload),
      content: <Chart {...parsed} />,
      canPromote: true,
    };
  }

  if (toolName === "item_carousel" || toolName === "item-carousel" || toolName === "ItemCarousel") {
    const parsed = safeParseSerializableItemCarousel(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildItemCarouselSummary(payload),
      content: <ItemCarousel {...parsed} />,
      canPromote: true,
    };
  }

  if (toolName === "geo_map" || toolName === "geo-map" || toolName === "GeoMap") {
    const parsed = safeParseSerializableGeoMap(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildGeoMapSummary(payload),
      content: <GeoMap {...parsed} />,
      canPromote: true,
    };
  }

  if (toolName === "link_preview") {
    const parsed = safeParseSerializableLinkPreview(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildLinkPreviewSummary(payload),
      content: <LinkPreview {...parsed} />,
      canPromote: true,
    };
  }

  if (toolName === "stats_display") {
    const parsed = safeParseSerializableStatsDisplay(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildStatsSummary(payload),
      content: <StatsDisplay {...parsed} />,
      canPromote: true,
    };
  }

  if (toolName === "terminal_output") {
    const parsed = safeParseSerializableTerminal(payload);
    if (!parsed) {
      return null;
    }
    return {
      summary: buildTerminalSummary(payload),
      content: <Terminal {...parsed} />,
      canPromote: false,
    };
  }

  return null;
}
