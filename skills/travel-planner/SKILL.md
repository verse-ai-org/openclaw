---
name: travel-planner
description: "中文旅行规划技能。用于偏好记录、路线规划、目的地调研、每日行程、交通与住宿策略、预算与行前清单。用户提到行程规划、路线选择、出行预算、酒店交通组合、行中改线重排时触发。"
license: MIT
metadata:
  openclaw:
    emoji: "✈️"
    requires:
      bins:
        - node
---

# Travel Planner

中文旅行规划技能。用于偏好记录、路线规划、目的地调研、规划每日行程、交通/住宿策略、预算与行前清单，以及行中改线重排。

## 适用范围

- 行程规划、路线规划、路线对比、制定每日计划、交通酒店组合策略
- 与真实行程绑定的预算、打包、礼仪、安全、行前清单
- 行中改线、错过交通后的重排与当天应急建议

## 不适用范围

- 仅单点天气/冷知识问答（无行程决策）
- 非旅行类技术任务
- 纯创作型内容（无出行决策/执行）

## Guardrails（必须遵守）

- **交互守卫**：调用交互工具（如 `question_flow` / `option_list` / `approval_card`）后必须 STOP，等待用户提交/选择后再继续
- **确认守卫**：遇到“继续旧行程 vs 新建”“路线选择”“计划骨架确认”“开启推送”等关键决策，必须明确问并等答复，不得自作主张
- **真实性**：不得臆造价格/班次/库存/评分/预订链接；实时信息必须来自实时查询（失败则标注“未验证”并降级）
- **降级透明**：平台或工具降级（如 `xhs -> search`）必须显式提示并记录原因；不得静默切换
- **轻量提问**：只问高影响项，不做超长问卷；到达日/返程日默认轻负荷
- **行程约束**：体力/天气/换乘摩擦是硬约束；每天最多“1 个主锚点 + 1 个附近备选”；大区域目的地先框路线再铺每日
- **计划落盘**：`plan-details.json` 仅在 Step 5 末尾落盘一次；Step 4 禁止 `save_details`。`plan_overview` 路径下用户在 `approval_card` 确认继续后须调用 `workflow.mjs --cmd=confirm_plan_overview`，否则 `save_details` 失败。
- **完整行程展示**：`save_details` 成功后，在对话里用 Markdown 回复用户时，**必须按 `references/plan-details.md` 的章节完整展开已落盘 JSON 的全部内容**（含 `destination` 各段、`transport` 去程/返程/备注、`weather` 总述与 `by_stop`、**每日**的 `summary` 与已填的 `morning`/`afternoon`/`evening`/`risks_or_notes`、**清单每一项**、`etiquette`/`safety` 的 `summary` 与 **全部 `bullets`**、`geo.text_fallback_route` 及已填坐标点说明）。**禁止**仅用「速览 /  Executive Summary / 表格浓缩」代替全文；若篇幅过长可分段发送或首条写「续下条」并在后续消息补全，不得省略字段。

## Quick start（按需阅读）

1. 先读 `workflows/step1-intake.md`
2. 证据与选线：`workflows/step2-evidence-and-route-choice.md`
3. 选中路线景点详情与单条计划落盘：`workflows/step3-route-poi-and-plan.md`
4. 交通/天气验证 + 是否先预览摘要：`workflows/step4-validate-transport-weather.md`；若选 `plan_overview` 则预览落盘：`workflows/step4-optional-itinerary-skeleton.md`
5. 全面计划详情 + Geo Map：`workflows/step5-plan-details.md`；（可选）酒店：`workflows/step5-optional-hotels.md`（须已 `plan_ready`）
6. 行中支持（含可选推送）：`workflows/step6-in-trip-support.md`
7. 行后沉淀：`workflows/step7-post-trip.md`

## 工作流索引

- Step 1：Intake（偏好/Trip 建档）→ `workflows/step1-intake.md`
- Step 2：Evidence & route choice（证据→**景点预览（§2，默认）**→锁线）→ `workflows/step2-evidence-and-route-choice.md`
- Step 3：Route POI & plan（**全线景点缓存**→单条 `route-plan`→确认）→ `workflows/step3-route-poi-and-plan.md`
- Step 4：Validate transport & weather → `workflows/step4-validate-transport-weather.md`
- Step 4b（计划预览，仅 `plan_overview`）：`workflows/step4-optional-itinerary-skeleton.md`
- Step 5：Plan details → `workflows/step5-plan-details.md`
- Step 5（Optional）：Hotels → `workflows/step5-optional-hotels.md`
- Step 6：In-trip support → `workflows/step6-in-trip-support.md`
- Step 7：Post-trip → `workflows/step7-post-trip.md`

## 参考资料（只在需要时读）

- **工具可用性/降级**：`references/capability-matrix.md`
- **字段契约/枚举口径**：`references/data-contracts.md`
- **完整行程 JSON 结构（plan-details）**：`references/plan-details.md`
- **协议**：`references/route-protocol.md`
- **行前清单/安全**：`references/travel-guidelines.md`
- **礼仪文化**：`references/cultural-etiquette.md`

## 资源索引（scripts）

| Path | Role |
|------|------|
| `scripts/preferences.mjs` | 偏好域存储与读写 |
| `scripts/trips.mjs` | Trip 数据层：schema 标准化、CRUD |
| `scripts/workflow.mjs` | 流程层：阶段守卫、evidence、`save_route_choice`、plan/validation 持久化、`confirm_route_choice`、`confirm_plan_overview`、出发流转、doctor |
| `scripts/poi.mjs` | 景点预览/缓存（`poi-preview.json` / `poi-cache.json`）落盘；全局 `data/poi/` upsert；`ingest` / `resolve` / `get_entry` / `doctor_store` |
| `scripts/plan.mjs` | 计划落盘：`save_overview`（预览）；`save_details` **仅在 Step 5 末尾调用一次**，且校验 `plan-details` schema（见 `references/plan-details.md`） |
| `scripts/booking.mjs` | 实时结果与 booking-ready 存储、预订确认（bookings_confirmed） |
| `scripts/briefing.mjs` | 行前/每日简报输入聚合（由 agent 生成内容） |
