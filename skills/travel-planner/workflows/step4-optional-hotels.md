# Step 4 (Optional) - Hotel Recommendations（可选：酒店实时查询与候选推荐）

本文件覆盖 Step 4 的**可选分支**（H-1 ~ H-4）。

**进入条件**：用户在 Step 4（Plan Details）末尾选择“进入酒店推荐（可选）”。
**产出**：酒店候选（按天或按主要落脚点）+（可选）`live-results.json` / `booking-ready.json` 持久化。
**失败/降级**：酒店实时查询失败→标注“未实时验证”，不得用经验补全。

## 目标

- 在不改变 Step 4（全面计划详情）的前提下，按需补齐**酒店候选**与预订链接
- 所有候选必须来自实时查询；不得臆造评分/库存/价格

## H-1｜确定住宿城市/区域（输入来自 Step 3/4）

- 以逐日计划的“住宿区域/落脚点”作为默认住宿城市
- 用户要求“减少换酒店/固定基地”时，优先按 1-2 个基地城市查酒店

## H-2｜实时查询酒店（按天或按基地）

```bash
flyai search-hotel --dest-name <当晚住宿城市> \
  --check-in-date <YYYY-MM-DD> --check-out-date <次日YYYY-MM-DD> \
  --sort rate_desc
```

输出约束：
- 每晚最多 2 个候选（避免刷屏）
- 必须保留实时链接字段（例如 `detailUrl/jumpUrl`）；没有链接就标注“暂无实时链接”

## H-3｜（可选）持久化 live-results 与 booking-ready

若需要为“可下单汇总/后续行中支持”保留结构化产物，则将酒店结果写入 `live-results.json` 并生成 booking-ready：

```bash
node {baseDir}/scripts/booking.mjs --cmd=save_live_results \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/live-results.json
```

由 agent/tool 生成 `booking-ready.json`（聚合 route-plan + route-validation + live-results），并落盘到 `~/.openclaw/agents/travel-planner/data/trips/<trip_id>/booking-ready.json`

```bash
node {baseDir}/scripts/booking.mjs --cmd=save_booking_ready \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/booking-ready.json
```

## H-4｜用户确认酒店（可选）

用户选定后可持久化确认项：

```bash
node {baseDir}/scripts/booking.mjs --cmd=confirm_booking \
  --trip-id=<trip_id> --category=hotel \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/confirmed.hotel.json
```
