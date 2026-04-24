---
name: openclaw-tool-ui
description: "OpenClaw Control UI: prefer structured tools that return JSON for rich inline result cards (Tool UI)."
metadata: { "openclaw": { "emoji": "🧩" } }
---

# OpenClaw Tool UI (Control UI)

OpenClaw **Control UI** (and similar web clients with **tool-events**) can render **rich inline components** when a tool returns **JSON** that matches a known schema. Plain `exec` + curl output stays as text; structured tools enable cards, previews, and future widgets.

This skill is the **single place** for that channel preference. **Domain skills** (weather, travel, etc.) stay focused on *what* to do; this skill defines *how to present* on Control UI when a matching tool exists.

## When to use this skill

- The user is chatting through **OpenClaw Control UI** (or you know the session has rich tool UI).
- You want **inline cards** instead of raw JSON or markdown-only tool output.
- You are choosing between **`exec`** / ad-hoc scripts and a **named structured tool**.

## Principles

1. **Prefer structured tools** over `exec` + curl when a dedicated tool exists for the same task.
2. **One tool name → one payload shape** (schema-first). The client maps tool names to components.
3. **Fallback**: If no structured tool exists, use domain skills as usual (`exec`, APIs, files).

## Registered structured tools (extend as shipped)

| Tool name          | Purpose                                              | Notes |
|--------------------|------------------------------------------------------|--------|
| `weather_widget`   | Weather / forecast as JSON card                      | Fetches wttr.in; params: `location`, optional `dayOffset`, `units`. |
| `code_block`       | Syntax-highlighted code / log block                | Passthrough: `id`, `code`, optional `language`, `filename`, etc. |
| `chart`            | Bar or line chart                                    | Passthrough: `id`, `type` (`bar`\|`line`), `data`, `xKey`, `series`. |
| `item_carousel`    | Image-first horizontal card carousel                 | Passthrough: `id`, optional `title/description`, `items[]` (`id`,`name`, optional `subtitle`,`image`,`actions`). |
| `geo_map`          | Interactive map with markers and optional routes     | Passthrough: `id`, `markers[]`, optional `routes[]`,`viewport`,`theme`. |
| `link_preview`     | Link preview card (title, image, domain)             | Passthrough: `id`, `href`, optional metadata and `ratio` / `fit`. |
| `stats_display`    | KPI / metrics grid                                   | Passthrough: `id`, `stats[]` (see Tool UI StatsDisplay schema). |
| `terminal_output`  | Terminal session card (command, stdout, exit code) | Passthrough: `id`, `command`, `exitCode`, optional `stdout` / `stderr`. |

Passthrough tools: the model passes the **same JSON** as tool arguments; the tool returns it as the tool result so Control UI can `safeParse` and render the matching component.

Add new rows here when OpenClaw ships additional Tool UI–aligned tools.

## `weather_widget` (detail)

Use for **current or near-future** weather when the UI can show the Weather Widget.

- **`location`** — City, region, or airport code (required).
- **`dayOffset`** — `0` = today, `1` = tomorrow, up to `3` (optional).
- **`units`** — `"celsius"` (default) or `"fahrenheit"` (optional).

For **terminals**, **automation**, or when this tool is unavailable, follow the **weather** skill (`curl` / wttr.in commands) instead.

## `code_block`, `chart`, `item_carousel`, `geo_map`, `link_preview`, `stats_display`, `terminal_output` (detail)

These mirror the serializable schemas under `ui-react/src/components/tool-ui/*/schema.ts`. Prefer calling the **named tool** with a complete JSON payload instead of pasting raw markdown or unstructured `exec` output when the user is on Control UI.

- **`code_block`** — Use for file snippets, configs, or long command output worth highlighting. Required: `id`, `code`.
- **`chart`** — Use for comparisons or trends. Required: `id`, `type`, `data` (array of row objects), `xKey`, `series` (each with `key` + `label` matching row fields).
- **`item_carousel`** — Use for image-heavy option exploration (routes, destinations, products). Required: `id`, `items[]` with `id` + `name`; include `image` whenever available.
- **`geo_map`** — Use for geographic context (POIs, route legs, coverage). Required: `id`, `markers[]`; optional `routes[]`, `viewport`, `theme`.
- **`link_preview`** — Use when sharing a URL with optional title/description/image you already know. Required: `id`, `href` (https).
- **`stats_display`** — Use for dashboards (KPIs, deltas, sparklines). Required: `id`, `stats` (array of items with at least `key`, `label`, `value`; optional `format` / `diff` / `sparkline` per `stats-display` schema).
- **`terminal_output`** — Use to present a command and its output as a card. Required: `id`, `command`, `exitCode`.

## Relationship to other skills

- **weather** — Domain: wttr.in formats, curl examples, when to answer weather questions. Does **not** duplicate Control UI card policy; point here for `weather_widget`.
- **openclaw-interactions** — Canonical protocol for structured user input (`<ask>`, `metadata.interaction`, channel downgrade semantics). Use it for all primary interactive-input flows.
- **Future Tool UI components** — Document new tools in the table above; keep domain logic in the relevant domain skill.

## References

- Tool UI overview: https://www.tool-ui.com/docs/overview
- In-repo widget code (weather): `ui-react/src/components/tool-ui/weather-widget/`
