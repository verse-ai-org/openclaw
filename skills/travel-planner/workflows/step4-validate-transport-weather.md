# Step 4 - Validate Transport & Weather（交通/天气验证 + 确认下一步流程）

## 目标
用户在确认路线后，先验证路线的可行性（交通 + 目的地天气），产出 `route-validation.json` 与顶层 `verdict`（go / caution / block）。  
验证落盘后，用户选择**是否先预览**（`plan_overview`：摘要落盘并确认；`full_plan`：跳过预览，见 `examples/option-list.plan-depth-choice.json`）。

## 守卫
**开始本步「调研与写验证」**：`trip.stage === route_confirmed` 且 `chosen_route_id` 非空。
**`save_route_validation` 之后**：`trip.stage` 变为 **`validated`**，且 **`plan_depth_choice` 被清空**，必须重新选一次「先预览摘要 / 跳过预览」并 `set_plan_depth_choice`。
> **重复验证注意**：只要你**再次**执行 `save_route_validation`（即使只改了 `route-validation.json` 内容），都会清空编排方式选择与 `plan_overview_confirmed`。必须重新走 **`option_list` → `set_plan_depth_choice`**；若当时走的是大纲路径且已 `save_overview`，还需重新 **`approval_card` → `confirm_plan_overview`** 后才能 `save_details`。
**失败/降级**：查询失败须标注「未验证」（见「兜底处理」与 `references/capability-matrix.md`）。

## 读取路线数据
从 `route-plan.json` 的 `route_options` 中取出 `chosen_route_id` 对应路线，读取 **`stop_points[]`**。出发城市：优先 `trip.departure_city`，否则 `preferences.departure_city`。

## 搜集交通信息

### 调研进入段交通（出发城市 ≠ `stop_points[0].name` 所代表城市时）
- 跨省或距离 > 500km：
  - `flyai search-flight --origin <出发城市> --destination <stop_points[0] 对应城市/站点> --dep-date <departure_date>`
  - `flyai search-train --origin <出发城市> --destination <stop_points[0] 对应城市/站点> --dep-date <departure_date>`
- 同省或距离 ≤ 500km：
  - `flyai search-train --origin <出发城市> --destination <stop_points[0] 对应城市/站点> --dep-date <departure_date>`
- 从查询结果中取前2条最优结果，提取 `jumpUrl`，航班号/车次，价格等信息写入`transport`：
  - `status`: `ok | unavailable | not_required`
  - `mode`: `flight | train | drive | mixed`
  - `booking_links`: `[{ label, url, price }]`（url=jumpUrl 原值）

结果字段约定：`references/route-protocol.md`下的**路线验证结果**。

### 调研游览段转场交通（仅含自驾约束时）
使用 `@skills/amap-lbs-skill` 查询相邻站点驾车时长。单日转场 > 4 小时在后续骨架/详单中标注提醒。  
判定口径（优先级从高到低）：`trip.self_drive_allowed` → `trip.mobility_mode` → `trip.constraints[]`（映射见 `references/data-contracts.md`）。

结果字段约定：`references/route-protocol.md`下的**路线验证结果**。

## 调研天气
- 从 `stop_points` 中选 2–3 个代表性地点（首站/中段/末站），使用 `@skills/weather` 查询 `departure_date ~ return_date`。  
- 获取结果，写入`weather`并裁决 `status`：go / caution / block。

结果字段约定：`references/route-protocol.md`下的**路线验证结果**。

## 综合裁决并持久化
```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_validation \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-validation.json
```

## 验证完成后，确认下一步流程
在 `route-validation.json` 已落盘后发起 `option_list`，模板见 `examples/option-list.plan-depth-choice.json`。
**调用 `option_list` 后必须 STOP**，待用户选择后继续。

用户选定后 **必须立刻** 持久化选择（否则 `plan.mjs` 守卫会失败）：
```bash
node {baseDir}/scripts/workflow.mjs --cmd=set_plan_depth_choice \
  --trip-id=<trip_id> \
  --choice=<plan_overview|full_plan>
```

分支行为（两条路**都只依赖**已有 `route-plan.json` + `route-validation.json`；**完整行程表**仍在 Step 5 **`save_details` 一次落盘）：

1. **`plan_overview`（预览摘要）**：仅根据 **`route-plan` + `route-validation`** 整理可读摘要 → `plan-overview.json`（`save_overview`）→ `approval_card` → `confirm_plan_overview` → **Step 5** Plan Details。
2. **`full_plan`（跳过预览）**：**不** `save_overview`、**不** `confirm_plan_overview`；**不**在 Step 4 做额外对话细排 → **`set_plan_depth_choice` 后直接开始 Step 5** Plan Details（输入仍是 `route-plan` + `route-validation`）。**禁止**在 Step 4 `save_details`。

## 兜底处理
- 交通查询失败：标注「未验证」，`status=unavailable`，仍可继续后续流程（骨架/详单定稿前须诚实说明）。
- 天气查询失败：标注「未验证」，verdict 可降级为 `caution`，同上。
- 两项均失败：仍可继续，但输出须说明「未实时验证」。
