# Step 3 - Validate Transport & Weather（交通/天气验证 + 下一步深度选择）

本文件覆盖主流程 Step 3（B-1 ~ B-7）。

**进入条件**：已确认 `chosen_route_id`（路线已选定）。
**产出**：
- `route-validation.json`（已持久化）
- 用户对下一步生成深度的选择（一次确认）
**失败/降级**：查询失败必须标注“未验证”（见本文件“兜底处理”与 `references/capability-matrix.md`）。

## 目标

- 调研出发交通与关键站点天气，输出 `verdict`（go / caution / block）
- 调研完成后生成计划骨架总览（plan overview）并落盘
- **让用户选择下一步深度（一次确认）**：
  - 生成“行程骨架”（便于先调整）
  - 或直接生成“逐日行程（详细版）”

## 进入条件

- `trip.stage` 已为 `route_confirmed`（用户已通过 `confirm_route_choice` 确认路线），且 `chosen_route_id` 非空  
  > 说明：`trip.json` **不**单独持久化 `route_choice_confirmed` 布尔字段；以 `stage` + `chosen_route_id` 为准。事件流中的 `route_choice_confirmed` 仅作审计，不作为 gate 字段名。

## B-1｜读取路线数据

从 `route-plan.json.route_options` 中取出 `chosen_route_id` 对应路线，读取其 **`stop_points[]`** 列表（schema 字段名；勿与 evidence 里的 `stops[]` 混淆）。

出发城市：优先 `trip.departure_city`，否则用 `preferences.departure_city`。

## B-2｜调研进入段交通（出发城市 ≠ `stop_points[0].name` 所代表城市时）

- 跨省或距离 > 500km：
  - `flyai search-flight --origin <出发城市> --destination <stop_points[0] 对应城市/站点> --dep-date <departure_date>`
  - `flyai search-train --origin <出发城市> --destination <stop_points[0] 对应城市/站点> --dep-date <departure_date>`
  - 从各结果 `itemList` 取前 2 条最优，提取 `jumpUrl` + 航班号/车次 + 价格 → `booking_links`
- 同省或距离 ≤ 500km：
  - `@skills/amap-lbs-skill` 评估驾车/高铁可行性
  - 高铁可行时仍用 `flyai search-train` 补充并提取 `jumpUrl`

写入 `transport_result`：
- `status`: `ok | unavailable | not_required`
- `mode`: `flight | train | drive | mixed`
- `booking_links`: `[{ label, url, price }]`（url=jumpUrl 原值）
- `raw`: 完整原始返回

## B-3｜调研游览段转场（仅含自驾约束时）

使用 `@skills/amap-lbs-skill` 查询相邻站点驾车时长。单日转场 > 4 小时在骨架中标注提醒。

判定口径（优先级从高到低）：

- `trip.self_drive_allowed: true|false`（结构化字段，推荐）
- `trip.mobility_mode: self_drive | private_car | public_transport | mixed`
- 历史 `trip.constraints[]`（如 `"不自驾"` / `"可自驾"`；兼容映射见 `references/data-contracts.md`）

## B-4｜调研天气（始终执行）

从 `stop_points` 中选 2-3 个代表性地点（首站/中段/末站），使用 `@skills/weather` 查询 `departure_date ~ return_date`。

写入 `weather_result.raw` 并裁决 `status`：
- `go`：无明显风险
- `caution`：2 天以上连续强降雨/大雪/大风预警，或极端高温/低温影响户外
- `block`：核心路段存在通行安全风险

## B-5｜综合裁决并持久化（输出前必须完成）

将完整结构写入文件再 `patch_trip`：

```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_validation \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-validation.json
```

字段口径与枚举参考 `references/route-protocol.md` / `references/data-contracts.md`。

## B-6｜（可选）生成行程骨架（plan overview）

```bash
node {baseDir}/scripts/plan.mjs --cmd=save_overview --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/plan-overview.json
```

说明：
- `save_overview` 会将产物落盘为 `data/trips/<trip_id>/plan-overview.json`
- 该骨架用于“先调整路线/节奏/风险口径”，不生成逐日行程卡片

## B-7｜验证完成后让用户选择生成深度（option_list，一次确认）

在 `route-validation.json` 已落盘后，必须让用户二选一：

1. **生成行程骨架（便于先调整）**：
   - 执行 B-6：`plan.mjs --cmd=save_overview`
   - 输出骨架要点（路线总览/交通与天气裁决/风险提醒/需要确认的问题）
   - 结束本轮，等待用户反馈后再进入逐日行程

2. **直接生成逐日行程（详细版）**：
   - 由 agent 直接生成 `plan-details.json`（包含逐日行程字段），然后调用 `plan.mjs --cmd=save_details` 落盘
   - 进入 Step 4（Plan details）后，再选择是否进入酒店实时查询与 booking-ready

推荐交互方式：`option_list`（payload 模板见 `examples/option-list.plan-depth-choice.json`）。

守卫：
- 调用 `option_list` 后必须 STOP，等待用户点选
- 用户选“骨架”走 B-6；用户选“详细版”走 `--cmd=full_plan`

## 兜底处理（降级）

- 交通查询失败：标注“未验证”，`status=unavailable`，仍可生成骨架
- 天气查询失败：标注“未验证”，verdict 降级为 `caution`，仍可生成骨架
- 两项均失败：骨架仍可生成，但必须在末尾说明“未实时验证”
