---
title: Travel Planner Artifacts Index
---

本文件用于固定 travel-planner 的“权威落盘文件”与“写入方”，减少 Step 编号与文件名不一致带来的排障成本。

## 根目录

- DB 根目录：`~/.openclaw/agents/travel-planner/`（可用 `TRAVEL_PLANNER_DB_DIR` 覆盖）
- 每个行程的产物目录：`data/trips/<trip_id>/`

## 权威产物（按流程顺序，语义化命名）

### Step 1（Intake）

- **Trip 主记录**：`data/trips/<trip_id>/trip.json`
  - 写入方：`scripts/trips.mjs`（`create` / `patch`）
  - 索引：`trips.json`（current/past）

### Step 2（Evidence & route choice）

- **路线证据**：`data/trips/<trip_id>/route-evidence.json`
  - 写入方：`scripts/workflow.mjs --cmd=save_route_evidence`

- **景点预览（Step 2 推荐默认；不参与 `save_route_plan` gate）**：`data/trips/<trip_id>/poi-preview.json`
  - 写入方：`scripts/poi.mjs --cmd=save_preview`；模板 `examples/poi-preview.template.json`；事件 `poi_preview_saved` 见 `events.jsonl`

- **选线锁定**：`trip.chosen_route_id` + `trip.stage === route_selected`
  - 写入方：`scripts/workflow.mjs --cmd=save_route_choice`

### Step 3（Route POI & plan）

- **景点缓存（权威）**：`data/trips/<trip_id>/poi-cache.json`
  - 写入方：`scripts/poi.mjs --cmd=save_cache`（写 trip 前 upsert 全局 `data/poi/`）
  - 用途：`save_route_plan` gate；模板 `examples/poi-cache.template.json`；顶层需 `context_key`（见 `references/route-protocol.md`）

## 全局景点库（跨 trip，目录名为 `data/poi/`）

- **目录**：`data/poi/entries/*.json`、`data/poi/query-index.json`（相对 DB 根，与 `scripts/lib/paths.mjs` 的 `poiDir()` 一致）
- **写入方**：`scripts/poi.mjs`（`save_cache`、`save_preview`、`ingest`）；只读排查：`get_entry`、`resolve`、`doctor_store`

- **路线计划**：`data/trips/<trip_id>/route-plan.json`
  - 写入方：`scripts/workflow.mjs --cmd=save_route_plan`（**恰好 1 条** `route_option`，且与 `trip.chosen_route_id` 一致）

- **最终确认路线**：`scripts/workflow.mjs --cmd=confirm_route_choice` → `trip.stage === route_confirmed`

### Step 4（Validate transport & weather）

- **约定**：本阶段**不得**调用 `scripts/plan.mjs --cmd=save_details`（**定稿只在 Step 5**）。
- **`full_plan` 路径**：只需 `trip.plan_depth_choice === full_plan`，**不需要** `plan-overview.json` 与 `plan_overview_confirmed`。
- **交通/天气验证结果**：`data/trips/<trip_id>/route-validation.json`
  - 写入方：`scripts/workflow.mjs --cmd=save_route_validation`（成功后 `trip.stage=validated`，清空 `plan_depth_choice`，并将 `plan_overview_confirmed` 置为 `false`）

- **行程编排方式（trip 字段）**：`trip.plan_depth_choice`，取值 `plan_overview | full_plan`（面向用户的选项说明见 `examples/option-list.plan-depth-choice.json`）
  - 写入方：`scripts/workflow.mjs --cmd=set_plan_depth_choice`（须在 `option_list` 选择后立即调用；`plan_overview` 再 `save_overview`，`full_plan` 则直接进入 Step 5）；调用时会将 `plan_overview_confirmed` 置为 `false`

- **大纲已确认（可进入详单定稿）**：`trip.plan_overview_confirmed`（布尔）
  - 写入方：`scripts/workflow.mjs --cmd=confirm_plan_overview`（在已 `save_overview` 且用户于 `approval_card` 选择继续之后）

- **计划预览摘要**：`data/trips/<trip_id>/plan-overview.json`
  - 写入方：`scripts/plan.mjs --cmd=save_overview`（仅 `plan_overview` 路径；内容须能由 `route-plan` + `route-validation` 推导，供用户确认）
  - 每次 `save_overview` 将 `trip.plan_overview_confirmed` 置为 `false`；用户于 `approval_card` 确认继续后须 `confirm_plan_overview`，否则 `save_details` 守卫失败（见上「大纲已确认」一条）。

### Step 4b（计划预览；仅当 `plan_overview`）

- 用户若选 **先预览**（`plan_overview`）：按 `workflows/step4-optional-itinerary-skeleton.md` 从 `route-plan` + `route-validation` 生成 `plan-overview.json` 并走 `confirm_plan_overview`，再到 **Step 5（Plan details）** 写 `plan-details.json`。若选 **跳过预览**（`full_plan`），**无本节**，`set_plan_depth_choice` 后直接进入 Step 5。

### Step 5（Plan details）

- **约定**：`plan-details.json` **仅在**本步末尾通过 `scripts/plan.mjs --cmd=save_details` 写入 **一次**；成功后 **`trip.stage` → `plan_ready`**。
- **全面计划详情**：`data/trips/<trip_id>/plan-details.json`
  - 写入方：`scripts/plan.mjs --cmd=save_details`（**`validatePlanDetails` 校验**，见 `references/plan-details.md`；示例 `examples/plan-details.template.json`）
- Step 5 末尾分支（`option_list`）模板：`examples/option-list.after-plan-details.json`

### Step 5（Optional hotels）

要求 **`trip.stage >= plan_ready`** 后，方可使用 `booking.mjs` 写入/确认。仅当用户在 Step 5 主流程末尾选择酒店分支时执行：

- **约定**：酒店/实时查询的权威落盘为 **`live-results.json`** 与 **`booking-ready.json`**；**无**独立 `hotels.json` 产物名。
- **实时结果**：`data/trips/<trip_id>/live-results.json`
  - 写入方：`scripts/booking.mjs --cmd=save_live_results`

- **booking-ready 包**：`data/trips/<trip_id>/booking-ready.json`
  - 写入方：`scripts/booking.mjs --cmd=save_booking_ready`

## 事件轨迹（可观测性）

- **事件日志**：`data/trips/<trip_id>/events.jsonl`
  - 写入方：`scripts/trips.mjs` / `scripts/workflow.mjs` / `scripts/plan.mjs` / `scripts/booking.mjs` / `scripts/poi.mjs`（关键节点 append）
  - 格式：JSONL（每行一个 JSON），适合排障与解释 fallback/决策链路

### Step 6（In-trip）

- 进入行中状态：`scripts/workflow.mjs --cmd=start_trip`（更新 `trip.stage`）

### Step 7（Post-trip）

- 归档：`scripts/trips.mjs --cmd=move_to_past`（从 current 移到 past，并写入完成时间）
