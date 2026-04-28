# Step 3 - Validate Transport & Weather（交通/天气验证 + 计划骨架确认）

本文件覆盖主流程 Step 3（B-1 ~ B-7）。

**进入条件**：已确认 `chosen_route_id`（路线已选定）。
**产出**：`step5.route-validation.json`（已持久化）+ `step6.plan-overview.json` + 用户对骨架的批准/拒绝。
**失败/降级**：查询失败必须标注“未验证”（见本文件“兜底处理”与 `references/capability-matrix.md`）。

## 目标

- 调研出发交通与关键站点天气，输出 `verdict`（go / caution / block）
- 调研完成后生成计划骨架并一次性输出，等待用户确认

## 进入条件

- `route_choice_confirmed=true` 且 `chosen_route_id` 已存在

## B-1｜读取路线数据

从 `step4.plan-output.json.route_options` 中取出 `chosen_route_id` 对应路线，读取 `stops` 列表。

出发城市：优先 `trip.departure_city`，否则用 `preferences.departure_city`。

## B-2｜调研进入段交通（出发城市 ≠ stops[0] 时）

- 跨省或距离 > 500km：
  - `flyai search-flight --origin <出发城市> --destination <stops[0]> --dep-date <departure_date>`
  - `flyai search-train --origin <出发城市> --destination <stops[0]> --dep-date <departure_date>`
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

从 stops 中选 2-3 个代表性地点（首站/中段/末站），使用 `@skills/weather` 查询 `departure_date ~ return_date`。

写入 `weather_result.raw` 并裁决 `status`：
- `go`：无明显风险
- `caution`：2 天以上连续强降雨/大雪/大风预警，或极端高温/低温影响户外
- `block`：核心路段存在通行安全风险

## B-5｜综合裁决并持久化（输出前必须完成）

将完整结构写入文件再 `patch_trip`：

```bash
node {baseDir}/scripts/trips.mjs --cmd=patch_trip \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step5.route-validation.json
```

字段口径与枚举参考 `references/route-protocol.md` / `references/data-contracts.md`。

## B-6｜生成计划骨架（持久化成功后立即执行）

```bash
node {baseDir}/scripts/plan-generator.mjs --cmd=plan_overview --trip-id=<trip_id>
```

强制落盘 `data/trips/<trip_id>/step6.plan-overview.json`。

## B-7｜输出骨架卡片并等待用户确认（approval_card）

展示骨架后必须发起 `approval_card` 交互确认（payload 见 `examples/approval.plan-overview.json`）。

守卫：
- 仅当 `metadata.interaction.payload.decision === "approved"` 才能进入 Step 4
- `denied`：先按用户反馈调整骨架，再次发起 `approval_card`

## 兜底处理（降级）

- 交通查询失败：标注“未验证”，`status=unavailable`，仍可生成骨架
- 天气查询失败：标注“未验证”，verdict 降级为 `caution`，仍可生成骨架
- 两项均失败：骨架仍可生成，但必须在末尾说明“未实时验证”
