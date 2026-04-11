---
name: openclaw-tool-ui
description: "OpenClaw Control UI: prefer structured tools that return JSON for rich inline cards (Tool UI). Use when the user is on a surface that renders chat tool results as components—not for headless terminals unless you need the same tool for consistency."
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

| Tool name          | Purpose                         | Notes |
|--------------------|---------------------------------|--------|
| `weather_widget`   | Weather / forecast as JSON card | Params: `location` (required), `dayOffset` (0–3, optional), `units` (`celsius` \| `fahrenheit`, optional). Uses wttr.in; no API key. |

Add new rows here when OpenClaw ships additional `*_widget` or Tool UI–aligned tools.

## `weather_widget` (detail)

Use for **current or near-future** weather when the UI can show the Weather Widget.

- **`location`** — City, region, or airport code (required).
- **`dayOffset`** — `0` = today, `1` = tomorrow, up to `3` (optional).
- **`units`** — `"celsius"` (default) or `"fahrenheit"` (optional).

For **terminals**, **automation**, or when this tool is unavailable, follow the **weather** skill (`curl` / wttr.in commands) instead.

## Relationship to other skills

- **weather** — Domain: wttr.in formats, curl examples, when to answer weather questions. Does **not** duplicate Control UI card policy; point here for `weather_widget`.
- **Future Tool UI components** — Document new tools in the table above; keep domain logic in the relevant domain skill.

## References

- Tool UI overview: https://www.tool-ui.com/docs/overview
- In-repo widget code (weather): `ui-react/src/components/tool-ui/weather-widget/`
