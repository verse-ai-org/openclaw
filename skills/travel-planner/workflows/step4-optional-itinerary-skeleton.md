# Step 4b - Plan preview（预览摘要；仅当 `plan_overview`）

## 目标
在 **`validated`** 且用户已选 **`plan_overview`** 时，**仅依据** 已落盘的 **`route-plan.json`** 与 **`route-validation.json`**，生成用户可读的「当前计划摘要」（每日大概安排 + 验证结论要点），并落盘 **`plan-overview.json`**。**不**在此步调用 `save_details`；**不**把本步当作重新调研或改写路线的场合。

## 守卫
**进入条件**：
- `trip.stage === validated`
- `route-validation.json` 已落盘
- `trip.plan_depth_choice === plan_overview`

## 生成预览摘要
由 agent **综合** `route-plan`（站点与顺序）与 `route-validation`（交通/天气/verdict）生成 `plan-overview.json`，并落盘：

```bash
node {baseDir}/scripts/plan.mjs --cmd=save_overview --trip-id=<trip_id> --payload=@.../plan-overview.json
```

## 输出结构
- 交通情况
  - 展示交通情况总结，`plan-overview.transport.summary`
  - 使用table展示交通信息详情，`plan-overview.transport.booking_links`，**必须包括**详情链接`plan-overview.transport.booking_links.url`
- 每一天建议:
  - 主目标（核心景区/区域）
  - 次目标（可选备选点）
  - 建议出发时段（上午/下午/全天）
  - 关键转场说明（长途/短途，不给具体班次）
  - 体力负荷（轻松/适中/紧凑）
  - 天气风险提醒（来自 Step 4 验证结果）
  - 住宿区域（仅区域/基地建议，不给酒店候选）
- 天气情况
  - 总结天气情况
  - 使用table展示天气详情`plan-overview.weather.highlights`

## 确认是否进入 Step 5（approval_card）
在 `save_overview` 之后，发起 `approval_card`：是否进入 Step 5 做全面计划详情。

**守卫**：
- 仅当 `metadata.interaction.payload.decision === "approved"` 才能进入 Step 5
- `denied`：按用户反馈调整骨架后可再次确认（可重新 `save_overview`，批准标记会再次被脚本清零）

用户批准后 **必须** 持久化守卫位（否则 `plan.mjs save_details` 会失败）：

```bash
node {baseDir}/scripts/workflow.mjs --cmd=confirm_plan_overview --trip-id=<trip_id>
```
