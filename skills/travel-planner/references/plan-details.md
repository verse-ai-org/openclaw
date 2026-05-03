---
title: Plan details（完整行程交付物）
---

`plan-details.json` 是 Step 5 **`plan.mjs --cmd=save_details`** 的唯一落盘内容，也是面向用户的**固定章节**交付结构。`schema_version` 当前为 **1**；校验实现见 `scripts/lib/schema.mjs` 的 `validatePlanDetails`。

## 章节与含义

| 路径 | 说明 |
|------|------|
| `schema_version` | 固定为 `1` |
| `generated_at` | ISO-8601 生成时间 |
| `trip_id` | 可选，与 `data/trips/<id>/` 对齐 |
| `chosen_route_id` | 可选，与 `route-plan` / `trip` 一致 |
| `destination` | 目的地：**摘要**、**地理位置/区域**、**文化与风俗概览**（可与 `etiquette_and_culture` 互补：此处偏「这是什么地方」，礼仪块偏「怎么做」） |
| `transport` | **去程** `outbound`、**返程** `return`（人话描述即可；链接与原始验证见 `route-validation`） |
| `weather` | **总体** `summary`；可选 `by_stop[]`：`label` + `summary`（代表性地点天气） |
| `days[]` | **每日卡片**：`day_index`（从 1 起）、`title`、`summary`；可选 `morning` / `afternoon` / `evening` / `risks_or_notes`；可选 `date`（`YYYY-MM-DD`，校验不强制） |
| `pre_departure_checklist` | `items[]`：至少一项，`label` 必填；可选 `done`（布尔） |
| `etiquette_and_culture` | `summary` 必填；可选 `bullets[]`（短句列表） |
| `safety_and_emergency` | `summary` 必填；可选 `emergency_numbers_note`、可选 `bullets[]` |
| `geo` | **`text_fallback_route` 必填**（无地图时的文字路线）；可选 `points[]`、`legs[]`（前端/渲染用，结构由产品约定，当前仅校验为数组） |

内容应**可追溯**到 `route-plan.json`、`route-validation.json`，并与 `references/travel-guidelines.md`、`references/cultural-etiquette.md` 中相关条目一致；不得臆造实时票价/库存。

**对话展示**：落盘后若在 Chat 中用 Markdown 发给用户，须**完整映射**本文件各章节（见 `workflows/step5-plan-details.md`「向用户展示」）；不得仅用速览表替代 JSON 内已有正文。

## 模板与扩展

- 示例骨架：`examples/plan-details.template.json`
- 今后若增大版本：递增 `schema_version`，在 `validatePlanDetails` 中分支或新增 `validatePlanDetailsV2`
