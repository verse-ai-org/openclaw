# Step 5 - Itinerary Detail & Booking（逐日细化 + 实时查询 + booking-ready）

本文件覆盖主流程 Step 5（D-1 ~ D-4）。

**进入条件**：用户确认进入 Step 5，且 Step 4 逐日骨架已存在。
**产出**：`step8.live-results.json` + `step8.booking-ready.json`（均持久化）+ booking-ready 的“可下单候选”汇总输出。
**失败/降级**：任一类实时查询失败→标注“未实时验证”，不得用经验补全（见 `references/capability-matrix.md`）。

## 目标

- 基于 Step 4 每日骨架，通过实时查询补齐每日具体交通方案与住宿候选
- 所有推荐必须来自实时查询，不得臆造价格、班次、库存、评分

## 进入条件

- 用户已确认进入 Step 5
- Step 4 的每日计划骨架已存在

## D-1｜实时查询交通与住宿

按每日骨架转场节点逐段查询：

- 进入段航班：默认复用 Step 3 `transport_result.booking_links`（已含 jumpUrl）；用户要求重查再调用 `flyai search-flight`
- 游览段驾车/接驳：`@skills/amap-lbs-skill`（仅在允许自驾时；判定口径见 `references/data-contracts.md`）
- 每日住宿（按天逐一查询）：

```bash
flyai search-hotel --dest-name <当晚住宿城市> \
  --check-in-date <YYYY-MM-DD> --check-out-date <次日YYYY-MM-DD> \
  --sort rate_desc
```

- 餐饮/POI：`flyai search-poi --city <城市> --keyword <关键词>`

将结果按天组装写入 `step8.live-results.json`（字段口径与枚举见 `references/route-protocol.md` / `references/data-contracts.md`）。

守卫：任一类查询失败时，必须标注该类为“未实时验证”，不得用经验数据填充。

## D-2｜生成 booking-ready 包并持久化

```bash
node {baseDir}/scripts/booking-ready.mjs \
  --trip=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/trip.json \
  --route=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-output.json \
  --validation=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step5.route-validation.json \
  --results=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step8.live-results.json

node {baseDir}/scripts/trip-workflow.mjs --cmd=save_live_results \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step8.live-results.json

node {baseDir}/scripts/trip-workflow.mjs --cmd=save_booking_ready \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step8.booking-ready.json
```

## D-3｜输出详细每日计划（两层输出）

层一：按天嵌入（每天末尾）
- 输出住宿推荐区块（最多 2 个候选），并给出实时链接（若无链接必须标注“暂无实时链接”）
- 若当天有转场，给出推荐方案 + 1 个备选（来自实时查询）

层二：末尾汇总表
- 数据来源：`booking-ready.mjs` 返回的 `accommodation_summary_table` 与 `transport_options`
- 必须注明哪些项“未实时验证”

## D-4｜持久化用户确认的预订项

用户选定后执行：

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=confirm_booking \
  --trip-id=<trip_id> --category=hotel \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step7.booking-confirmed.json
```
