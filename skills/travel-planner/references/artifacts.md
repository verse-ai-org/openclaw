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

### Step 2（Route planning）

- **POI 缓存（amap-lbs-skill 权威来源）**：`data/trips/<trip_id>/poi-cache.json`
  - 写入方：`scripts/poi.mjs --cmd=save_cache`
  - 用途：为 `route-plan.json` 的 `route_options[].stop_points[]` 提供权威坐标/图片；`save_route_plan` 会对该缓存做 gate 校验
  - 模板：`examples/poi-cache.template.json`

- **路线证据**：`data/trips/<trip_id>/route-evidence.json`
  - 写入方：`scripts/workflow.mjs --cmd=save_route_evidence`

- **路线候选输出**：`data/trips/<trip_id>/route-plan.json`
  - 写入方：由 agent/tool 生成 `route-plan.json` 后，调用 `scripts/workflow.mjs --cmd=save_route_plan` 落盘
  - 读取方：后续 Step 3/Step 4 会读取该文件的 `route_options`

### Step 3（Validate transport & weather）

- **交通/天气验证结果**：`data/trips/<trip_id>/route-validation.json`
  - 写入方：`scripts/workflow.mjs --cmd=save_route_validation`

- **计划骨架总览**：`data/trips/<trip_id>/plan-overview.json`
  - 写入方：`scripts/plan.mjs --cmd=save_overview`

### Step 3（Optional itinerary skeleton）

- 逐日骨架由 `plan-generator.mjs --cmd=itinerary_skeleton` 生成（如有落盘文件，以脚本输出为准）

### Step 4（Plan details）

- **全面计划详情**：`data/trips/<trip_id>/plan-details.json`
  - 写入方：`scripts/plan.mjs --cmd=save_details`
- Step 4 末尾分支选择（交互卡片模板）：
  - `examples/option-list.step4-next.json`（Step 6 vs Hotels）

### Step 4（Optional hotels）

仅当用户选择进入酒店推荐（可选）时，才会执行酒店实时查询，并可选落盘：

- **实时结果**：`data/trips/<trip_id>/live-results.json`
  - 写入方：`scripts/booking.mjs --cmd=save_live_results`

- **booking-ready 包**：`data/trips/<trip_id>/booking-ready.json`
  - 写入方：`scripts/booking.mjs --cmd=save_booking_ready`

## 事件轨迹（可观测性）

- **事件日志**：`data/trips/<trip_id>/events.jsonl`
  - 写入方：`scripts/trips.mjs` / `scripts/workflow.mjs` / `scripts/plan.mjs` / `scripts/booking.mjs`（关键节点 append）
  - 格式：JSONL（每行一个 JSON），适合排障与解释 fallback/决策链路

### Step 5（In-trip）

- 进入行中状态：`scripts/workflow.mjs --cmd=start_trip`（更新 `trip.stage`）

### Step 6（Post-trip）

- 归档：`scripts/trips.mjs --cmd=move_to_past`（从 current 移到 past，并写入完成时间）
