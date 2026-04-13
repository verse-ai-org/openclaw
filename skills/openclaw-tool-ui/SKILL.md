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
4. **Control UI — avoid split assistant turns** for `question_flow` / `option_list`: do not emit a *second* assistant message that only contains `<final>…</final>` prose *after* the tool result in the same user-visible turn. Put short guidance **before** the tool call in the same assistant generation, or keep prose minimal so the interactive card stays with the visible reply. (The client also anchors cards to the last assistant row in a run, but the model should still prefer one coherent turn.)

## Registered structured tools (extend as shipped)

| Tool name          | Purpose                                              | Notes |
|--------------------|------------------------------------------------------|--------|
| `weather_widget`   | Weather / forecast as JSON card                      | Fetches wttr.in; params: `location`, optional `dayOffset`, `units`. |
| `question_flow`    | Multi-step questionnaire card                        | Passthrough JSON config; user submits answers as a new message. |
| `option_list`      | Single-step option picker                            | Passthrough JSON config; user confirms selection as a new message. |
| `code_block`       | Syntax-highlighted code / log block                | Passthrough: `id`, `code`, optional `language`, `filename`, etc. |
| `chart`            | Bar or line chart                                    | Passthrough: `id`, `type` (`bar`\|`line`), `data`, `xKey`, `series`. |
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

## `question_flow` (detail)

Use when you need to collect **multiple structured answers** from the user in a single interaction (e.g., onboarding, preference intake). The UI renders an interactive multi-step form; when the user completes it, their answers arrive as a plain-text message in the format:

```
步骤标题：选中选项标签
步骤标题：选中选项标签
```

**Upfront mode** (all steps shown at once, recommended):

```json
{
  "id": "preference-intake",
  "steps": [
    {
      "id": "budget",
      "title": "预算档位",
      "options": [
        { "id": "economy",   "label": "经济型" },
        { "id": "mid-range", "label": "中档" },
        { "id": "high-end",  "label": "高端" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "pace",
      "title": "出行节奏",
      "options": [
        { "id": "relaxed",  "label": "轻松" },
        { "id": "moderate", "label": "适中" },
        { "id": "intensive","label": "紧凑" }
      ],
      "selectionMode": "single"
    }
  ]
}
```

Rules:
- `id` must be a stable, unique string (kebab-case, e.g. `"preference-intake"`).
- Each step `id` must be unique within the flow.
- `selectionMode`: `"single"` (default) or `"multi"`.
- **Return this JSON as the tool result** (not as a text reply). The Control UI renders the form.
- After the user submits, parse their reply line-by-line (`步骤标题：答案`) to extract each field value.

## `option_list` (detail)

Use when you need the user to **pick from a list** in a single step (e.g., choose a route, confirm a platform). The UI renders an option card; when the user confirms, their answer arrives as a plain-text message with the selected labels joined by `、`.

```json
{
  "id": "platform-choice",
  "options": [
    { "id": "search", "label": "搜索（Brave）" },
    { "id": "xhs",    "label": "小红书" }
  ],
  "selectionMode": "single"
}
```

Rules:
- `id` must be a stable, unique string.
- **Return this JSON as the tool result**.
- After the user confirms, parse their reply to map label → option id.

## `code_block`, `chart`, `link_preview`, `stats_display`, `terminal_output` (detail)

These mirror the serializable schemas under `ui-react/src/components/tool-ui/*/schema.ts`. Prefer calling the **named tool** with a complete JSON payload instead of pasting raw markdown or unstructured `exec` output when the user is on Control UI.

- **`code_block`** — Use for file snippets, configs, or long command output worth highlighting. Required: `id`, `code`.
- **`chart`** — Use for comparisons or trends. Required: `id`, `type`, `data` (array of row objects), `xKey`, `series` (each with `key` + `label` matching row fields).
- **`link_preview`** — Use when sharing a URL with optional title/description/image you already know. Required: `id`, `href` (https).
- **`stats_display`** — Use for dashboards (KPIs, deltas, sparklines). Required: `id`, `stats` (array of items with at least `key`, `label`, `value`; optional `format` / `diff` / `sparkline` per `stats-display` schema).
- **`terminal_output`** — Use to present a command and its output as a card. Required: `id`, `command`, `exitCode`.

## Relationship to other skills

- **weather** — Domain: wttr.in formats, curl examples, when to answer weather questions. Does **not** duplicate Control UI card policy; point here for `weather_widget`.
- **Future Tool UI components** — Document new tools in the table above; keep domain logic in the relevant domain skill.

## References

- Tool UI overview: https://www.tool-ui.com/docs/overview
- In-repo widget code (weather): `ui-react/src/components/tool-ui/weather-widget/`
