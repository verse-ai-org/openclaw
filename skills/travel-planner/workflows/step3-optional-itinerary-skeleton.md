# Step 3 (Optional) - Itinerary Skeleton（可选：生成每日行程骨架）

本文件覆盖 Step 3 的**可选分支**（S3-OPT-1 ~ S3-OPT-3）：在交通/天气验证已完成后，按天生成每日行程骨架，便于用户先调整，再进入后续的计划详情或酒店推荐。

**进入条件**：
- `trip.stage === route_confirmed` 且 `chosen_route_id` 已设置（含义同 Step 3 主流程，不依赖名为 `route_choice_confirmed` 的 trip 字段）
- `route-validation.json` 已落盘（否则骨架/详情无法正确生成）
- 用户在 Step 3 的“生成深度选择”中未选择 `full_plan`，并明确要求生成每日骨架

**产出**：每日行程骨架（不含具体班次/酒店/预订链接）+ 是否进入 Step 5（Plan details）的用户确认。

## S3-OPT-1｜生成每日骨架

由 agent 生成 `plan-overview.json`（或直接生成 `plan-details.json`），并用以下命令落盘：
```bash
node {baseDir}/scripts/plan.mjs --cmd=save_overview --trip-id=<trip_id> --payload=@.../plan-overview.json`
```

> 说明：`itinerary_skeleton` 会基于已落盘的交通/天气验证结果与已确认路线生成每日结构化卡片；它不做实时查询。

## S3-OPT-2｜输出每日骨架（每一天必含字段）

- 主目标（核心景区/区域）
- 次目标（可选备选点）
- 建议出发时段（上午/下午/全天）
- 关键转场说明（长途/短途，不给具体班次）
- 体力负荷（轻松/适中/紧凑）
- 天气风险提醒（来自 Step 3 验证结果）
- 住宿区域（仅区域/基地建议，不给酒店候选）

### 禁止事项

- 不输出机票/高铁班次候选
- 不输出酒店名称或预订链接
- 不给“可直接下单”结论

## S3-OPT-3｜确认是否进入 Step 5（approval_card）

在输出每日骨架后，发起 `approval_card` 确认是否进入 Step 5 做“全面计划详情（含 Geo Map）”。

守卫：
- 仅当 `metadata.interaction.payload.decision === "approved"` 才能进入 Step 5
- `denied`：按用户反馈调整每日骨架后可再次发起确认
